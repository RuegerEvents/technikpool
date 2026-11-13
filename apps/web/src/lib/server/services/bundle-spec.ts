import { naturalCompare } from '#lib/sort.js';
import { makerAndName, withCaption } from '#lib/product-label.js';
import { prisma } from '#lib/server/auth.js';
import { appError } from '#lib/errors.js';
import {
	bundleKey,
	countProducts,
	matchesSpec,
	specShortfall,
	specSurplus,
	type BundleSpecLine,
	type BundleTypeSpec
} from '#lib/bundle-spec.js';

/**
 * What a bundle type holds, read off the cases that exist.
 *
 * Per product, the most any one case holds of it. Taking the maximum rather
 * than the oldest case's number is what makes a missing fixture read as an
 * incomplete case instead of quietly redefining the kit for every other case
 * of the type.
 *
 * Only members that were *picked* count: an accessory follows the unit it is
 * attached to into the kit and is never chosen on its own, so counting one
 * would ask for something no picker can offer.
 *
 * Kits nested inside count as lines of their own, one per bundle type ("1×
 * PowerCon-Set"), by the same maximum. Their contents are the inner type's
 * business, not this one's: a unit inside the inner kit is not a member here.
 *
 * A type with a single case still reports one: it is what a second case has to
 * match. What that one case may itself hold is nobody's business —
 * `assertAdditionsFitType` is where that exemption lives.
 */
export async function bundleTypeSpec(templateId: string): Promise<BundleTypeSpec> {
	const [instanceCount, members, innerKits] = await Promise.all([
		prisma.assetBundle.count({ where: { templateId } }),
		prisma.asset.findMany({
			where: { bundle: { templateId }, parentAssetId: null },
			select: {
				bundleId: true,
				productId: true,
				product: {
					select: { name: true, imagePath: true, manufacturer: { select: { name: true } } }
				}
			}
		}),
		prisma.assetBundle.findMany({
			where: { parentBundle: { templateId } },
			select: {
				parentBundleId: true,
				templateId: true,
				imagePath: true,
				template: { select: { name: true, caption: true } }
			}
		})
	]);
	if (instanceCount === 0) return { templateId, instanceCount, lines: [] };

	const perInstance = new Map<string, Map<string, number>>();
	const labels = new Map<string, Omit<BundleSpecLine, 'quantity'>>();
	const count = (instanceId: string, key: string) => {
		const counts = perInstance.get(instanceId) ?? new Map<string, number>();
		counts.set(key, (counts.get(key) ?? 0) + 1);
		perInstance.set(instanceId, counts);
	};
	for (const member of members) {
		count(member.bundleId!, member.productId);
		labels.set(member.productId, {
			kind: 'product',
			key: member.productId,
			productId: member.productId,
			templateId: null,
			name: member.product.name,
			manufacturerName: member.product.manufacturer?.name ?? null,
			imagePath: member.product.imagePath
		});
	}
	for (const kit of innerKits) {
		const key = bundleKey(kit.templateId);
		count(kit.parentBundleId!, key);
		labels.set(key, {
			kind: 'bundle',
			key,
			productId: null,
			templateId: kit.templateId,
			name: withCaption(kit.template.name, kit.template.caption),
			manufacturerName: null,
			imagePath: labels.get(key)?.imagePath ?? kit.imagePath
		});
	}
	const quantities = new Map<string, number>();
	for (const counts of perInstance.values()) {
		for (const [key, n] of counts) {
			quantities.set(key, Math.max(quantities.get(key) ?? 0, n));
		}
	}
	const lines = [...quantities]
		.map(([key, quantity]) => ({ ...labels.get(key)!, quantity }))
		// The kits inside first: they are what the case is built around.
		.sort(
			(a, b) =>
				Number(a.kind === 'product') - Number(b.kind === 'product') ||
				naturalCompare(
					makerAndName(a.manufacturerName, a.name),
					makerAndName(b.manufacturerName, b.name)
				)
		);
	return { templateId, instanceCount, lines };
}

/** What a case holds now: the picked members by product, and its inner kits by type. */
async function currentCounts(bundleId: string) {
	const [members, innerKits] = await Promise.all([
		prisma.asset.findMany({
			where: { bundleId, parentAssetId: null },
			select: { productId: true }
		}),
		prisma.assetBundle.findMany({
			where: { parentBundleId: bundleId },
			select: { templateId: true }
		})
	]);
	return countProducts(members, innerKits);
}

function describe(spec: BundleTypeSpec, key: string) {
	const line = spec.lines.find((l) => l.key === key);
	return line ? makerAndName(line.manufacturerName, line.name) : '';
}

/** The refusal for what the type has no room for, a product or an inner kit. */
function refuseSurplus(spec: BundleTypeSpec, key: string): never {
	const label = describe(spec, key);
	const isKit = key.startsWith(bundleKey(''));
	// Two different mistakes, and the fix differs: a product the kit has never
	// held is either the wrong unit or a change to the type, while one too many
	// of a product it does hold is simply one too many.
	if (!label) appError(409, isKit ? 'bundle_kit_not_in_type' : 'bundle_product_not_in_type');
	appError(409, isKit ? 'bundle_kit_quantity_exceeded' : 'bundle_product_quantity_exceeded', [
		label
	]);
}

/**
 * Refuses units — and kits to nest inside, by their bundle type — the type
 * has no room for.
 *
 * `bundleId` is the case they are joining, or null when it does not exist yet.
 * `allowTypeChange` is the deliberate override: adding a product the type does
 * not hold is how a type grows, and the only way to say "yes, this kit is
 * different now" — the caller asks the user first.
 */
export async function assertAdditionsFitType(args: {
	templateId: string;
	bundleId: string | null;
	productIds: string[];
	/** The bundle types of kits going inside it. */
	innerTemplateIds?: string[];
	allowTypeChange?: boolean;
}) {
	const innerTemplateIds = args.innerTemplateIds ?? [];
	if (args.productIds.length + innerTemplateIds.length === 0 || args.allowTypeChange) return;
	const spec = await bundleTypeSpec(args.templateId);
	// The only case of a type *is* the type: whatever goes into it defines what
	// the next one will have to match, so nothing here can be out of spec.
	if (spec.instanceCount < 2 || spec.lines.length === 0) return;

	const counts = args.bundleId ? await currentCounts(args.bundleId) : new Map<string, number>();
	for (const [key, n] of countProducts(
		args.productIds.map((productId) => ({ productId })),
		innerTemplateIds.map((templateId) => ({ templateId }))
	)) {
		counts.set(key, (counts.get(key) ?? 0) + n);
	}
	const surplus = specSurplus(spec.lines, counts);
	if (surplus.length === 0) return;
	refuseSurplus(spec, surplus[0].key);
}

/**
 * Refuses a new case that isn't the kit — the same products in the same
 * numbers as the cases that already exist.
 *
 * Only on creation: a case that loses a fixture afterwards is incomplete, which
 * the bundle page says plainly and nothing refuses.
 */
export async function assertNewInstanceMatchesType(
	templateId: string,
	productIds: string[],
	innerTemplateIds: string[] = []
) {
	const spec = await bundleTypeSpec(templateId);
	if (spec.lines.length === 0) return;

	const counts = countProducts(
		productIds.map((productId) => ({ productId })),
		innerTemplateIds.map((t) => ({ templateId: t }))
	);
	if (matchesSpec(spec.lines, counts)) return;

	const short = specShortfall(spec.lines, counts).filter(({ missing }) => missing > 0);
	if (short.length > 0) {
		const [{ line, missing }] = short;
		appError(409, 'bundle_composition_incomplete', [
			missing,
			makerAndName(line.manufacturerName, line.name)
		]);
	}
	refuseSurplus(spec, specSurplus(spec.lines, counts)[0].key);
}
