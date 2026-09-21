import { prisma } from '$lib/server/auth';
import { BOOKABLE_ASSET_WHERE, isBookableStatus } from '$lib/asset-status';
import { accessoryIdsOf } from '$lib/server/services/accessories';
import {
	getOrgIdsNeedingApprovalNotification,
	notifyPendingApproval
} from '$lib/server/services/approval-notifications';
import { orgLabel } from '$lib/utils';
import type { AddedToProductionData, RequestedData } from '$lib/types/asset-transaction';

// Taking over another production's equipment list. What carries over is the
// list — so many of this product, so many of that kit — not a promise about
// particular tags: the source's own units are preferred, because they are the
// ones someone already packed that way, but on new dates they may be out on
// another job, and then any free unit of the same product from the same org
// does the job just as well.
//
// Copying tops up rather than adds: a line counts what the target already
// holds, so taking over the same list twice books nothing the second time.

const ACTIVE_STATUSES = ['PENDING', 'APPROVED', 'CHECKED_OUT', 'RETURNED'];
const CONFLICT_STATUSES = ['PENDING', 'APPROVED', 'CHECKED_OUT'];

type OrgInfo = {
	id: string;
	name: string;
	shortName: string | null;
	color: string;
	avatarLabel: string;
};
type CategoryInfo = {
	id: string;
	name: string;
	nameDe: string | null;
	color: string;
	sortOrder: number;
};

export type CopyLine = {
	key: string;
	kind: 'product' | 'bundle';
	name: string;
	manufacturerName: string | null;
	imagePath: string | null;
	categoryId: string;
	categoryName: string;
	categoryNameDe: string | null;
	categoryColor: string;
	categorySortOrder: number;
	organizationId: string;
	organizationName: string;
	organizationColor: string;
	organizationAvatarLabel: string;
	/** Tags of the source's units (or kits) — what the reader recognises. */
	tags: string[];
	/** How many the source has: units, or kits for a bundle line. */
	quantity: number;
	/** How many of those the target holds already. */
	alreadyHere: number;
	/** How many copying would book now — at most `quantity - alreadyHere`. */
	available: number;
	/** Of `available` kits, how many would go out short of a unit. */
	incomplete: number;
};

type Pick = { kind: 'product'; assetIds: string[] } | { kind: 'bundle'; bundleIds: string[] };

export type CopyPlan = { lines: CopyLine[]; picks: Map<string, Pick> };

function lineMeta(category: CategoryInfo, org: OrgInfo) {
	return {
		categoryId: category.id,
		categoryName: category.name,
		categoryNameDe: category.nameDe,
		categoryColor: category.color,
		categorySortOrder: category.sortOrder,
		organizationId: org.id,
		organizationName: orgLabel(org),
		organizationColor: org.color,
		organizationAvatarLabel: org.avatarLabel
	};
}

const ORG_SELECT = {
	select: { id: true, name: true, shortName: true, color: true, avatarLabel: true }
} as const;
const CATEGORY_SELECT = {
	select: { id: true, name: true, nameDe: true, color: true, sortOrder: true }
} as const;

/** Units booked by another production whose dates overlap the target's. */
async function busyAssetIds(
	assetIds: string[],
	target: { id: string; startDate: Date | null; endDate: Date | null }
) {
	if (assetIds.length === 0 || !target.startDate || !target.endDate) return new Set<string>();
	const items = await prisma.productionItem.findMany({
		where: {
			assetId: { in: assetIds },
			productionId: { not: target.id },
			status: { in: CONFLICT_STATUSES },
			production: {
				startDate: { not: null, lte: target.endDate },
				endDate: { not: null, gte: target.startDate }
			}
		},
		select: { assetId: true }
	});
	return new Set(items.map((item) => item.assetId));
}

async function loadTarget(targetId: string) {
	return prisma.production.findUniqueOrThrow({
		where: { id: targetId },
		select: {
			id: true,
			name: true,
			startDate: true,
			endDate: true,
			organizationId: true,
			organization: { select: { id: true, name: true } },
			items: {
				select: {
					id: true,
					assetId: true,
					status: true,
					sourceBundleId: true,
					sourceBundle: { select: { templateId: true } },
					asset: { select: { productId: true, organizationId: true, parentAssetId: true } }
				}
			}
		}
	});
}

export async function planEquipmentCopy(sourceId: string, targetId: string): Promise<CopyPlan> {
	const [source, target] = await Promise.all([
		prisma.production.findUniqueOrThrow({
			where: { id: sourceId },
			select: {
				items: {
					where: { status: { in: ACTIVE_STATUSES } },
					include: {
						asset: {
							include: {
								product: { include: { manufacturer: true, category: CATEGORY_SELECT } },
								organization: ORG_SELECT
							}
						},
						sourceBundle: {
							include: {
								template: { include: { category: CATEGORY_SELECT, organization: ORG_SELECT } }
							}
						}
					},
					orderBy: [{ asset: { assetTag: { sort: 'asc', nulls: 'last' } } }, { assetId: 'asc' }]
				}
			}
		}),
		loadTarget(targetId)
	]);

	const inTarget = new Set(target.items.map((item) => item.assetId));
	const activeTarget = target.items.filter((item) => ACTIVE_STATUSES.includes(item.status));
	const lines: CopyLine[] = [];
	const picks = new Map<string, Pick>();

	// ── Products ──────────────────────────────────────────────────────────
	// Accessories are left to their parent: they come along with whichever
	// unit is booked, and are never booked on their own.
	const productLines = new Map<string, CopyLine>();
	/** Per product line: which product, and where the source's units came from. */
	const productSource = new Map<
		string,
		{ productId: string; assetIds: string[]; locationIds: Set<string> }
	>();
	for (const item of source.items) {
		if (item.asset.parentAssetId !== null || item.sourceBundleId !== null) continue;
		const { asset } = item;
		const key = `product:${asset.productId}:${asset.organizationId}`;
		let line = productLines.get(key);
		if (!line) {
			line = {
				key,
				kind: 'product',
				name: asset.product.name,
				manufacturerName: asset.product.manufacturer?.name ?? null,
				imagePath: asset.product.imagePath,
				...lineMeta(asset.product.category, asset.organization),
				tags: [],
				quantity: 0,
				alreadyHere: 0,
				available: 0,
				incomplete: 0
			};
			productLines.set(key, line);
			productSource.set(key, { productId: asset.productId, assetIds: [], locationIds: new Set() });
		}
		const origin = productSource.get(key)!;
		// A unit shown with its accessories reads better than the bare product.
		if (asset.generatedImagePath) line.imagePath = asset.generatedImagePath;
		line.quantity++;
		origin.assetIds.push(asset.id);
		origin.locationIds.add(asset.locationId);
		if (asset.assetTag) line.tags.push(asset.assetTag);
	}
	for (const item of activeTarget) {
		if (item.asset.parentAssetId !== null || item.sourceBundleId !== null) continue;
		const line = productLines.get(`product:${item.asset.productId}:${item.asset.organizationId}`);
		if (line) line.alreadyHere++;
	}

	const productValues = [...productLines.values()];
	const candidates = productValues.length
		? await prisma.asset.findMany({
				where: {
					OR: productValues.map((line) => ({
						productId: productSource.get(line.key)!.productId,
						organizationId: line.organizationId
					})),
					parentAssetId: null,
					id: { notIn: [...inTarget] },
					...BOOKABLE_ASSET_WHERE
				},
				select: {
					id: true,
					productId: true,
					organizationId: true,
					locationId: true,
					bundleId: true
				},
				orderBy: { createdAt: 'asc' }
			})
		: [];
	const busy = await busyAssetIds(
		candidates.map((asset) => asset.id),
		target
	);
	for (const line of productValues) {
		const need = Math.max(0, line.quantity - line.alreadyHere);
		const free = candidates.filter(
			(asset) =>
				`product:${asset.productId}:${asset.organizationId}` === line.key && !busy.has(asset.id)
		);
		const origin = productSource.get(line.key)!;
		const fromSource = new Set(origin.assetIds);
		// The source's own units first, then units kept where those were, then
		// anything else. A unit that sits in a kit is only taken if the source
		// had it on its own too — otherwise copying would quietly break a kit up.
		const rank = (asset: (typeof free)[number]) =>
			fromSource.has(asset.id)
				? 0
				: asset.bundleId
					? 3
					: origin.locationIds.has(asset.locationId)
						? 1
						: 2;
		const chosen = free
			.filter((asset) => rank(asset) < 3)
			.sort((a, b) => rank(a) - rank(b))
			.slice(0, need);
		line.available = chosen.length;
		picks.set(line.key, { kind: 'product', assetIds: chosen.map((asset) => asset.id) });
		lines.push(line);
	}

	// ── Kits ──────────────────────────────────────────────────────────────
	const bundleLines = new Map<string, CopyLine>();
	/** Per kit line: which bundle type, and which of its kits the source had. */
	const bundleSource = new Map<string, { templateId: string; bundleIds: string[] }>();
	for (const item of source.items) {
		const bundle = item.sourceBundle;
		if (!bundle) continue;
		const key = `bundle:${bundle.templateId}`;
		let line = bundleLines.get(key);
		if (!line) {
			line = {
				key,
				kind: 'bundle',
				name: bundle.template.name,
				manufacturerName: null,
				imagePath: bundle.imagePath,
				...lineMeta(bundle.template.category, bundle.template.organization),
				tags: [],
				quantity: 0,
				alreadyHere: 0,
				available: 0,
				incomplete: 0
			};
			bundleLines.set(key, line);
			bundleSource.set(key, { templateId: bundle.templateId, bundleIds: [] });
		}
		const origin = bundleSource.get(key)!;
		if (origin.bundleIds.includes(bundle.id)) continue;
		origin.bundleIds.push(bundle.id);
		line.quantity++;
		if (bundle.tag) line.tags.push(bundle.tag);
		if (!line.imagePath) line.imagePath = bundle.imagePath;
	}
	const kitsInTarget = new Set(
		activeTarget.map((item) => item.sourceBundleId).filter((id): id is string => id !== null)
	);
	const bundleValues = [...bundleLines.values()];
	const instances = bundleValues.length
		? await prisma.assetBundle.findMany({
				where: { templateId: { in: [...bundleSource.values()].map((o) => o.templateId) } },
				select: {
					id: true,
					templateId: true,
					tag: true,
					assets: { select: { id: true, status: true, parentAssetId: true } }
				},
				orderBy: [{ tag: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }]
			})
		: [];
	const busyInKits = await busyAssetIds(
		instances.flatMap((kit) => kit.assets.map((asset) => asset.id)),
		target
	);
	for (const line of bundleValues) {
		const origin = bundleSource.get(line.key)!;
		const ofType = instances.filter((kit) => kit.templateId === origin.templateId);
		line.alreadyHere = ofType.filter((kit) => kitsInTarget.has(kit.id)).length;
		const need = Math.max(0, line.quantity - line.alreadyHere);
		const fromSource = new Set(origin.bundleIds);
		const usable = ofType
			.filter((kit) => !kitsInTarget.has(kit.id))
			.map((kit) => {
				const units = kit.assets.filter(
					(asset) =>
						inTarget.has(asset.id) || (isBookableStatus(asset.status) && !busyInKits.has(asset.id))
				);
				return { kit, units: units.length, complete: units.length === kit.assets.length };
			})
			.filter(({ units }) => units > 0)
			// A complete kit beats the source's own one that would ship short.
			.sort(
				(a, b) =>
					Number(b.complete) - Number(a.complete) ||
					Number(fromSource.has(b.kit.id)) - Number(fromSource.has(a.kit.id))
			);
		const chosen = usable.slice(0, need);
		line.available = chosen.length;
		line.incomplete = chosen.filter(({ complete }) => !complete).length;
		picks.set(line.key, { kind: 'bundle', bundleIds: chosen.map(({ kit }) => kit.id) });
		lines.push(line);
	}

	const collator = new Intl.Collator('de', { numeric: true, sensitivity: 'base' });
	lines.sort(
		(a, b) =>
			a.categorySortOrder - b.categorySortOrder ||
			collator.compare(a.categoryName, b.categoryName) ||
			collator.compare(a.name, b.name) ||
			collator.compare(a.organizationName, b.organizationName)
	);
	return { lines, picks };
}

/**
 * Books the chosen lines of a fresh plan. Planned and booked in one call, so
 * nothing someone else booked in between can end up booked twice — the plan a
 * dialog showed is only ever a preview.
 */
export async function copyEquipment(
	sourceId: string,
	targetId: string,
	keys: string[],
	userId: string
) {
	const [plan, target] = await Promise.all([
		planEquipmentCopy(sourceId, targetId),
		loadTarget(targetId)
	]);
	const wanted = new Set(keys);
	const chosen = plan.lines.filter((line) => wanted.has(line.key));
	const inTarget = new Map(target.items.map((item) => [item.assetId, item]));

	type NewItem = {
		assetId: string;
		organizationId: string;
		sourceBundleId: string | null;
		sourceParentAssetId: string | null;
	};
	const newItems: NewItem[] = [];
	const adoptions: { itemId: string; bundleId: string }[] = [];

	const unitIds = chosen.flatMap((line) => {
		const pick = plan.picks.get(line.key);
		return pick?.kind === 'product' ? pick.assetIds : [];
	});
	const units = await prisma.asset.findMany({
		where: { id: { in: unitIds } },
		select: { id: true, organizationId: true }
	});
	// What is attached to a unit ships with it, booked under that unit.
	const accessoriesByParent = await accessoryIdsOf(unitIds);
	for (const unit of units) {
		newItems.push({
			assetId: unit.id,
			organizationId: unit.organizationId,
			sourceBundleId: null,
			sourceParentAssetId: null
		});
		for (const accessoryId of accessoriesByParent.get(unit.id) ?? []) {
			if (inTarget.has(accessoryId)) continue;
			newItems.push({
				assetId: accessoryId,
				organizationId: unit.organizationId,
				sourceBundleId: null,
				sourceParentAssetId: unit.id
			});
		}
	}

	const kitIds = chosen.flatMap((line) => {
		const pick = plan.picks.get(line.key);
		return pick?.kind === 'bundle' ? pick.bundleIds : [];
	});
	const kits = await prisma.assetBundle.findMany({
		where: { id: { in: kitIds } },
		select: {
			id: true,
			assets: { select: { id: true, status: true, organizationId: true, parentAssetId: true } }
		}
	});
	const kitAssetIds = kits.flatMap((kit) => kit.assets.map((asset) => asset.id));
	const busy = await busyAssetIds(kitAssetIds, target);
	// Same as adding a kit by hand: a unit that cannot go is left behind, one
	// already booked here on its own moves under the kit, and the accessories
	// in a kit are booked with it because they mirror its bundleId.
	for (const kit of kits) {
		for (const asset of kit.assets) {
			const existing = inTarget.get(asset.id);
			if (existing) {
				if (existing.sourceBundleId === null)
					adoptions.push({ itemId: existing.id, bundleId: kit.id });
				continue;
			}
			if (!isBookableStatus(asset.status) || busy.has(asset.id)) continue;
			newItems.push({
				assetId: asset.id,
				organizationId: asset.organizationId,
				sourceBundleId: kit.id,
				sourceParentAssetId: asset.parentAssetId
			});
		}
	}

	// A unit the source had on its own can sit in a kit that is copied too.
	const unique = [...new Map(newItems.map((item) => [item.assetId, item])).values()];
	const lenderOrgIds = [
		...new Set(
			unique.map((item) => item.organizationId).filter((id) => id !== target.organizationId)
		)
	];
	// Asked before booking: only an org with no open request here yet is told.
	const orgsToNotify = await getOrgIdsNeedingApprovalNotification(targetId, lenderOrgIds);

	const statusFor = (organizationId: string) =>
		organizationId === target.organizationId ? 'APPROVED' : 'PENDING';
	await prisma.$transaction([
		prisma.productionItem.createMany({
			data: unique.map((item) => ({
				productionId: targetId,
				assetId: item.assetId,
				sourceBundleId: item.sourceBundleId,
				sourceParentAssetId: item.sourceParentAssetId,
				status: statusFor(item.organizationId)
			})),
			skipDuplicates: true
		}),
		...adoptions.map(({ itemId, bundleId }) =>
			prisma.productionItem.update({ where: { id: itemId }, data: { sourceBundleId: bundleId } })
		),
		prisma.assetTransaction.createMany({
			data: unique.map((item) => {
				const crossOrg = item.organizationId !== target.organizationId;
				return {
					assetId: item.assetId,
					userId,
					productionId: targetId,
					action: crossOrg ? 'REQUESTED' : 'ADDED_TO_PRODUCTION',
					data: crossOrg
						? ({
								type: 'REQUESTED',
								productionId: targetId,
								productionName: target.name,
								requestingOrgId: target.organization.id,
								requestingOrgName: target.organization.name
							} satisfies RequestedData)
						: ({
								type: 'ADDED_TO_PRODUCTION',
								productionId: targetId,
								productionName: target.name
							} satisfies AddedToProductionData)
				};
			})
		})
	]);

	if (orgsToNotify.length > 0)
		await notifyPendingApproval(targetId, target.name, target.organization.name, orgsToNotify);

	return {
		/** Units booked, accessories included. */
		booked: unique.length,
		kits: kits.length,
		/** Units and kits asked for that could not be booked. */
		short: chosen.reduce(
			(sum, line) => sum + Math.max(0, line.quantity - line.alreadyHere - line.available),
			0
		)
	};
}
