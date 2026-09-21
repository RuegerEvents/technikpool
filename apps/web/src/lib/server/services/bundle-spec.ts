import { makerAndName } from '$lib/product-label';
import { prisma } from '$lib/server/auth';
import { appError } from '$lib/errors';
import {
	countProducts,
	matchesSpec,
	specShortfall,
	specSurplus,
	type BundleTypeSpec
} from '$lib/bundle-spec';

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
 * A type with a single case still reports one: it is what a second case has to
 * match. What that one case may itself hold is nobody's business —
 * `assertAdditionsFitType` is where that exemption lives.
 */
export async function bundleTypeSpec(templateId: string): Promise<BundleTypeSpec> {
	const [instanceCount, members] = await Promise.all([
		prisma.assetBundle.count({ where: { templateId } }),
		prisma.asset.findMany({
			where: { bundle: { templateId }, parentAssetId: null },
			select: {
				bundleId: true,
				productId: true,
				product: { select: { name: true, manufacturer: { select: { name: true } } } }
			}
		})
	]);
	if (instanceCount === 0) return { templateId, instanceCount, lines: [] };

	const perInstance = new Map<string, Map<string, number>>();
	const labels = new Map<string, { name: string; manufacturerName: string | null }>();
	for (const member of members) {
		const counts = perInstance.get(member.bundleId!) ?? new Map<string, number>();
		counts.set(member.productId, (counts.get(member.productId) ?? 0) + 1);
		perInstance.set(member.bundleId!, counts);
		labels.set(member.productId, {
			name: member.product.name,
			manufacturerName: member.product.manufacturer?.name ?? null
		});
	}
	const quantities = new Map<string, number>();
	for (const counts of perInstance.values()) {
		for (const [productId, count] of counts) {
			quantities.set(productId, Math.max(quantities.get(productId) ?? 0, count));
		}
	}
	const lines = [...quantities]
		.map(([productId, quantity]) => ({
			productId,
			quantity,
			name: labels.get(productId)!.name,
			manufacturerName: labels.get(productId)!.manufacturerName
		}))
		.sort((a, b) =>
			makerAndName(a.manufacturerName, a.name).localeCompare(
				makerAndName(b.manufacturerName, b.name)
			)
		);
	return { templateId, instanceCount, lines };
}

/** What a case holds now: the picked members, by product. */
async function currentCounts(bundleId: string) {
	const members = await prisma.asset.findMany({
		where: { bundleId, parentAssetId: null },
		select: { productId: true }
	});
	return countProducts(members);
}

function describe(spec: BundleTypeSpec, productId: string) {
	const line = spec.lines.find((l) => l.productId === productId);
	return line ? makerAndName(line.manufacturerName, line.name) : '';
}

/**
 * Refuses units the type has no room for.
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
	allowTypeChange?: boolean;
}) {
	if (args.productIds.length === 0 || args.allowTypeChange) return;
	const spec = await bundleTypeSpec(args.templateId);
	// The only case of a type *is* the type: whatever goes into it defines what
	// the next one will have to match, so nothing here can be out of spec.
	if (spec.instanceCount < 2 || spec.lines.length === 0) return;

	const counts = args.bundleId ? await currentCounts(args.bundleId) : new Map<string, number>();
	for (const productId of args.productIds) {
		counts.set(productId, (counts.get(productId) ?? 0) + 1);
	}
	const surplus = specSurplus(spec.lines, counts);
	if (surplus.length === 0) return;

	const [first] = surplus;
	const label = describe(spec, first.productId);
	// Two different mistakes, and the fix differs: a product the kit has never
	// held is either the wrong unit or a change to the type, while one too many
	// of a product it does hold is simply one too many.
	if (!label) appError(409, 'bundle_product_not_in_type');
	appError(409, 'bundle_product_quantity_exceeded', [label]);
}

/**
 * Refuses a new case that isn't the kit — the same products in the same
 * numbers as the cases that already exist.
 *
 * Only on creation: a case that loses a fixture afterwards is incomplete, which
 * the bundle page says plainly and nothing refuses.
 */
export async function assertNewInstanceMatchesType(templateId: string, productIds: string[]) {
	const spec = await bundleTypeSpec(templateId);
	if (spec.lines.length === 0) return;

	const counts = countProducts(productIds.map((productId) => ({ productId })));
	if (matchesSpec(spec.lines, counts)) return;

	const short = specShortfall(spec.lines, counts).filter(({ missing }) => missing > 0);
	if (short.length > 0) {
		const [{ line, missing }] = short;
		appError(409, 'bundle_composition_incomplete', [
			missing,
			makerAndName(line.manufacturerName, line.name)
		]);
	}
	const [first] = specSurplus(spec.lines, counts);
	const label = describe(spec, first.productId);
	if (!label) appError(409, 'bundle_product_not_in_type');
	appError(409, 'bundle_product_quantity_exceeded', [label]);
}
