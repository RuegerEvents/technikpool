import { prisma } from '#lib/server/auth.js';
import { ACTIVE_ASSET_WHERE, isBookableStatus } from '#lib/asset-status.js';
import { kitAssetsWhere } from '#lib/bundle-nesting.js';
import { bundleNumber } from '#lib/bundle-case.js';
import { bundleLabel } from '#lib/product-label.js';
import {
	bookedKitItems,
	kitSwapDecision,
	kitSwapPlan,
	wholeKits,
	type BookedKit,
	type KitSwapRefusal
} from '#lib/kit-swap.js';
import type { KitReplacedData, KitRef } from '#lib/types/asset-transaction.js';
import { bundleCaseOf } from './asset-lookup';

// The database half of a whole kit standing in for the booked one; the rules
// are in #lib/kit-swap. Called by `performBulkCheckout` (checkout.ts) before it
// books anything, so a kit's number scanned on the handout list or in a
// session, and a bulk checkout holding a whole kit, find the booking already
// on the scanned kit and simply check it out.

/** What the scan result says: "instead of Ring 1 · booking moved to Ring 2". */
export type KitSwapNotice = {
	replacedKitId: string;
	/** The kit that stays home, with its number. */
	replacedKitName: string;
	kitId: string;
	/** The kit that went, with its number. */
	kitName: string;
};

/** A refusal, with the two kits' names for the message. */
export class KitSwapRefused extends Error {
	constructor(
		readonly reason: KitSwapRefusal,
		readonly bookedKit: string,
		readonly scannedKit: string
	) {
		super(
			reason === 'started'
				? `${bookedKit} has already been started — scan the units one by one`
				: reason === 'not_interchangeable'
					? `${bookedKit} is booked, and ${scannedKit} holds a unit marked not interchangeable — scan ${bookedKit} instead`
					: `${bookedKit} is booked, and ${scannedKit} is out or booked elsewhere at the same time — scan ${bookedKit} instead`
		);
		this.name = 'KitSwapRefused';
	}
}

/** A kit with its number, for names in notices and history. */
async function kitRef(
	bundleId: string
): Promise<KitRef & { templateId: string; orgId: string; number: string | null }> {
	const bundle = await prisma.assetBundle.findUniqueOrThrow({
		where: { id: bundleId },
		select: {
			id: true,
			tag: true,
			templateId: true,
			template: { select: { name: true, caption: true, organizationId: true } }
		}
	});
	const number = bundleNumber(bundle, await bundleCaseOf(bundleId)).code;
	return {
		id: bundle.id,
		name: bundleLabel({ tag: number, template: bundle.template }),
		templateId: bundle.templateId,
		orgId: bundle.template.organizationId,
		number
	};
}

/**
 * The kits a bulk checkout holds whole: every top-level unit of the kit that
 * could go (active, bookable) is among the picked ones.
 */
export async function wholeKitsPicked(
	assets: {
		id: string;
		bundleId: string | null;
		bundle?: { parentBundleId: string | null } | null;
	}[],
	selected: Set<string>
) {
	const ids = [
		...new Set(
			assets
				.filter((a) => selected.has(a.id))
				.flatMap((a) => [a.bundleId, a.bundle?.parentBundleId ?? null])
				.filter((id): id is string => id !== null)
		)
	];
	if (ids.length === 0) return [];
	const kits = await prisma.assetBundle.findMany({
		where: { id: { in: ids } },
		select: { id: true, parentBundleId: true }
	});
	const withUnits = await Promise.all(
		kits.map(async (kit) => {
			const units = await prisma.asset.findMany({
				where: { ...kitAssetsWhere(kit.id), parentAssetId: null, ...ACTIVE_ASSET_WHERE },
				select: { id: true, status: true }
			});
			return {
				...kit,
				unitIds: units.filter((u) => isBookableStatus(u.status)).map((u) => u.id)
			};
		})
	);
	return wholeKits(withUnits, selected);
}

/**
 * Hands the booking of the booked kit of `kitId`'s type over to that kit, if
 * #lib/kit-swap says so: the booked kit's items go, the scanned kit's units
 * are booked APPROVED in their place (the caller checks them out), and both
 * kits' units get a KIT_REPLACED entry. Throws `KitSwapRefused` when a booked
 * kit of the type is there but may not be replaced; null when none is.
 */
export async function standInForKit(
	userId: string,
	production: {
		id: string;
		name: string;
		startDate: Date | null;
		endDate: Date | null;
	},
	kitId: string
): Promise<{ notice: KitSwapNotice; releasedAssetIds: string[] } | null> {
	const items = await prisma.productionItem.findMany({
		where: { productionId: production.id, sourceBundleId: { not: null } },
		select: {
			id: true,
			assetId: true,
			status: true,
			sourceBundleId: true,
			sourceParentAssetId: true,
			packedInItemId: true,
			loanRequestId: true,
			freeOfCharge: true,
			asset: { select: { bundleId: true, bundle: { select: { parentBundleId: true } } } }
		}
	});
	const bookedItems = bookedKitItems(items);
	bookedItems.delete(kitId);
	if (bookedItems.size === 0) return null;

	const scanned = await kitRef(kitId);
	const sameType = await prisma.assetBundle.findMany({
		where: { id: { in: [...bookedItems.keys()] }, templateId: scanned.templateId },
		select: { id: true }
	});
	if (sameType.length === 0) return null;
	const booked: (BookedKit & { ref: KitRef })[] = await Promise.all(
		sameType.map(async ({ id }) => {
			const ref = await kitRef(id);
			return {
				id,
				templateId: ref.templateId,
				organizationId: ref.orgId,
				number: ref.number,
				items: bookedItems.get(id)!,
				ref
			};
		})
	);

	const units = await prisma.asset.findMany({
		where: { ...kitAssetsWhere(kitId), ...ACTIVE_ASSET_WHERE },
		select: {
			id: true,
			status: true,
			parentAssetId: true,
			productionItems: {
				where: { status: { notIn: ['DECLINED', 'CANCELLED'] } },
				select: {
					productionId: true,
					status: true,
					production: { select: { startDate: true, endDate: true } }
				}
			}
		}
	});
	const going = units.filter((u) => isBookableStatus(u.status));
	const { startDate: start, endDate: end } = production;
	// The same test as booking a kit: out anywhere, or booked elsewhere for
	// overlapping days. A production without both dates overlaps nothing.
	const unavailable = going.some((u) =>
		u.productionItems.some(
			(i) =>
				i.productionId !== production.id &&
				(i.status === 'CHECKED_OUT' ||
					(['PENDING', 'APPROVED'].includes(i.status) &&
						start !== null &&
						end !== null &&
						i.production.startDate !== null &&
						i.production.endDate !== null &&
						i.production.startDate <= end &&
						i.production.endDate >= start))
		)
	);
	const decision = kitSwapDecision(
		{
			id: kitId,
			templateId: scanned.templateId,
			organizationId: scanned.orgId,
			bookedHere: units.some((u) =>
				u.productionItems.some((i) => i.productionId === production.id)
			),
			unavailable
		},
		booked
	);
	if (decision.kind === 'none') return null;
	const replaced = booked.find((k) => k.id === decision.kit.id)!;
	if (decision.kind === 'refused') {
		throw new KitSwapRefused(decision.reason, replaced.ref.name, scanned.name);
	}

	const replacedItems = bookedItems.get(replaced.id)!;
	const plan = kitSwapPlan(replacedItems, {
		id: kitId,
		units: units.map((u) => ({
			id: u.id,
			parentAssetId: u.parentAssetId,
			bookable: isBookableStatus(u.status)
		}))
	});
	// A lent kit stays lent on the same terms: the request it was approved
	// under, and whether it was free of charge.
	const loan = items.find((i) => i.id === replacedItems[0].id)!;
	const kit: KitRef = { id: scanned.id, name: scanned.name };
	const other: KitRef = { id: replaced.ref.id, name: replaced.ref.name };
	const entry = (role: KitReplacedData['role']): KitReplacedData => ({
		type: 'KIT_REPLACED',
		role,
		productionId: production.id,
		productionName: production.name,
		kit: role === 'took_over' ? kit : other,
		otherKit: role === 'took_over' ? other : kit
	});

	await prisma.$transaction(async (tx) => {
		await tx.productionItem.deleteMany({ where: { id: { in: plan.removeItemIds } } });
		// Accessories booked along with a released unit go with it, as in
		// any stand-in (checkOutInPlaceOf).
		await tx.productionItem.deleteMany({
			where: {
				productionId: production.id,
				sourceParentAssetId: { in: plan.releasedAssetIds },
				status: 'APPROVED'
			}
		});
		await tx.productionItem.createMany({
			data: plan.create.map((c) => ({
				productionId: production.id,
				...c,
				status: 'APPROVED',
				loanRequestId: loan.loanRequestId,
				freeOfCharge: loan.freeOfCharge
			}))
		});
		await tx.assetTransaction.createMany({
			data: [
				...plan.releasedAssetIds.map((assetId) => ({
					assetId,
					userId,
					productionId: production.id,
					action: 'KIT_REPLACED',
					data: entry('released')
				})),
				...plan.create.map((c) => ({
					assetId: c.assetId,
					userId,
					productionId: production.id,
					action: 'KIT_REPLACED',
					data: entry('took_over')
				}))
			]
		});
	});

	return {
		notice: {
			replacedKitId: replaced.id,
			replacedKitName: replaced.ref.name,
			kitId,
			kitName: scanned.name
		},
		releasedAssetIds: plan.releasedAssetIds
	};
}
