import type { Prisma } from '#lib/prisma/client.js';
import { prisma } from '#lib/server/auth.js';
import { ACTIVE_ASSET_WHERE } from '#lib/asset-status.js';
import { bundleLabel, withCaption } from '#lib/product-label.js';
import type { SwapPlace, SwappedData } from '#lib/types/asset-transaction.js';
import {
	bookedWithPlace,
	swapBookingClash,
	swapPlacements,
	swapRefusal,
	type SwapRefusal
} from '#lib/unit-swap.js';
import { syncAccessories } from './accessories';

// The database half of swapping linked units; the rules are in #lib/unit-swap.
// Used by handing out (checkout.ts, through `findStandIns`) and by the case
// check (case-check.ts). Never by take-back or the stocktake.

/** What a swap reads of each unit. */
export const SWAP_UNIT_SELECT = {
	id: true,
	assetTag: true,
	orgIndex: true,
	productId: true,
	organizationId: true,
	bundleId: true,
	parentAssetId: true,
	locationId: true,
	status: true,
	product: { select: { name: true, caption: true, notInterchangeable: true } },
	bundle: {
		select: {
			id: true,
			tag: true,
			parentBundleId: true,
			template: { select: { name: true, caption: true } }
		}
	},
	parent: {
		select: {
			id: true,
			assetTag: true,
			orgIndex: true,
			product: { select: { name: true, caption: true } }
		}
	},
	_count: { select: { accessories: { where: ACTIVE_ASSET_WHERE } } }
} as const;

export type SwapRow = Prisma.AssetGetPayload<{ select: typeof SWAP_UNIT_SELECT }>;

export async function loadSwapRows(ids: string[]): Promise<SwapRow[]> {
	if (ids.length === 0) return [];
	return prisma.asset.findMany({ where: { id: { in: ids } }, select: SWAP_UNIT_SELECT });
}

function swapUnit(row: SwapRow) {
	return { ...row, accessoryCount: row._count.accessories };
}

/** What the scan result says: "swapped with 40000123 — now in Ring 1, 40000123 to Ring 3". */
export type SwapNotice = {
	partnerAssetId: string;
	/** The partner's tag, else its number. */
	partnerLabel: string;
	/** Where the scanned unit is now. */
	joined: string;
	/** Where the partner went; null when it became loose. */
	partnerTo: string | null;
};

export function unitLabel(unit: { assetTag: string | null; orgIndex: number }) {
	return unit.assetTag ?? `#${unit.orgIndex}`;
}

function placeOf(row: SwapRow): SwapPlace | null {
	if (row.parent) {
		const name = withCaption(row.parent.product.name, row.parent.product.caption);
		return { kind: 'unit', id: row.parent.id, name: `${name} (${unitLabel(row.parent)})` };
	}
	if (row.bundle) return { kind: 'kit', id: row.bundle.id, name: bundleLabel(row.bundle) };
	return null;
}

/** The open bookings of these units, with what decides whether they follow its place. */
async function openBookings(unitIds: string[], exceptProductionId?: string) {
	return prisma.productionItem.findMany({
		where: {
			assetId: { in: unitIds },
			status: { in: ['DRAFT', 'PENDING', 'APPROVED', 'CHECKED_OUT'] },
			...(exceptProductionId ? { productionId: { not: exceptProductionId } } : {})
		},
		select: {
			id: true,
			assetId: true,
			productionId: true,
			status: true,
			sourceBundleId: true,
			sourceParentAssetId: true,
			production: { select: { startDate: true, endDate: true } }
		}
	});
}

/**
 * Why `scanned` may not take `partner`'s place, or null when it may.
 * `current`: handing out, the production the partner is booked on, whose
 * booking the scanned unit takes over — it counts as one of the partner's
 * place-bound bookings, and the scanned one may hold none that overlaps it.
 */
export async function swapCheck(
	scanned: SwapRow,
	partner: SwapRow,
	current?: { id: string; startDate: Date | null; endDate: Date | null }
): Promise<SwapRefusal | null> {
	const bookings = await openBookings([scanned.id, partner.id], current?.id);
	const out = (id: string) => bookings.some((b) => b.assetId === id && b.status === 'CHECKED_OUT');
	const refusal = swapRefusal(swapUnit(scanned), swapUnit(partner), {
		notInterchangeable: scanned.product.notInterchangeable,
		scannedOut: out(scanned.id),
		partnerOut: out(partner.id)
	});
	if (refusal) return refusal;

	const placed = (assetId: string) =>
		bookings
			.filter((b) => b.assetId === assetId)
			.map((b) => ({
				productionId: b.productionId,
				startDate: b.production.startDate,
				endDate: b.production.endDate,
				sourceBundleId: b.sourceBundleId,
				sourceParentAssetId: b.sourceParentAssetId
			}));
	const partnerBookings = placed(partner.id);
	// The booking being handed out is the partner's place's, by definition.
	if (current) {
		partnerBookings.push({
			productionId: current.id,
			startDate: current.startDate,
			endDate: current.endDate,
			sourceBundleId: partner.bundleId,
			sourceParentAssetId: partner.parentAssetId
		});
	}
	const clash = swapBookingClash(
		{ unit: scanned, bookings: placed(scanned.id) },
		{ unit: partner, bookings: partnerBookings }
	);
	return clash ? 'booking_clash' : null;
}

/**
 * Swaps the two units' places, with their accessories, and moves the open
 * bookings that belong to each place to the unit now in it. The booking on
 * `production` (handing out) is left to the caller, which checks it out on the
 * scanned unit. Writes SWAPPED into both histories.
 */
export async function applySwap(
	tx: Prisma.TransactionClient,
	userId: string,
	scanned: SwapRow,
	partner: SwapRow,
	via: { kind: 'handout'; production: { id: string; name: string } } | { kind: 'case_check' }
): Promise<SwapNotice> {
	const placements = swapPlacements(swapUnit(scanned), swapUnit(partner));
	const exceptProductionId = via.kind === 'handout' ? via.production.id : undefined;
	const bookings = await openBookings([scanned.id, partner.id], exceptProductionId);
	// Neither unit is out (`swapCheck`), so every booking here is still to come.
	const followers = (row: SwapRow) =>
		bookings.filter((b) => b.assetId === row.id && bookedWithPlace(b, row));
	const scannedFollowers = followers(scanned);
	const partnerFollowers = followers(partner);

	for (const [row, placement] of [
		[scanned, placements.scanned],
		[partner, placements.partner]
	] as const) {
		await tx.asset.update({ where: { id: row.id }, data: placement });
		await syncAccessories(tx, row.id, {
			bundleId: placement.bundleId,
			locationId: placement.locationId
		});
	}

	// Each place's bookings to the unit now in it. A production that booked
	// both keeps both items and swaps what they were booked as instead, since an
	// item can't move onto a unit that already has one there.
	// Every item, closed ones too: a production holds one per unit at most.
	const items = await tx.productionItem.findMany({
		where: { assetId: { in: [scanned.id, partner.id] } },
		select: { assetId: true, productionId: true }
	});
	const heldBy = (assetId: string) =>
		new Set(items.filter((i) => i.assetId === assetId).map((i) => i.productionId));
	const scannedHeld = heldBy(scanned.id);
	const partnerHeld = heldBy(partner.id);
	for (const [moving, to, held] of [
		[partnerFollowers, scanned, scannedHeld],
		[scannedFollowers, partner, partnerHeld]
	] as const) {
		for (const item of moving) {
			if (held.has(item.productionId)) continue;
			await tx.productionItem.update({ where: { id: item.id }, data: { assetId: to.id } });
		}
	}
	const both = bookings.filter((b) => b.assetId === scanned.id && partnerHeld.has(b.productionId));
	for (const mine of both) {
		const theirs = bookings.find(
			(b) => b.assetId === partner.id && b.productionId === mine.productionId
		);
		if (!theirs) continue;
		await tx.productionItem.update({
			where: { id: mine.id },
			data: {
				sourceBundleId: theirs.sourceBundleId,
				sourceParentAssetId: theirs.sourceParentAssetId
			}
		});
		await tx.productionItem.update({
			where: { id: theirs.id },
			data: { sourceBundleId: mine.sourceBundleId, sourceParentAssetId: mine.sourceParentAssetId }
		});
	}

	const scannedFrom = placeOf(scanned);
	const partnerFrom = placeOf(partner);
	const production = via.kind === 'handout' ? via.production : null;
	const entry = (other: SwapRow, from: SwapPlace | null, to: SwapPlace | null): SwappedData => ({
		type: 'SWAPPED',
		partnerAssetId: other.id,
		partnerLabel: unitLabel(other),
		from,
		to,
		via: via.kind,
		...(production ? { productionId: production.id, productionName: production.name } : {})
	});
	// The partner went to the scanned unit's old place, or loose if it had none.
	const partnerTo = scannedFrom;
	await tx.assetTransaction.createMany({
		data: [
			{
				assetId: scanned.id,
				userId,
				productionId: production?.id ?? null,
				action: 'SWAPPED',
				data: entry(partner, scannedFrom, partnerFrom)
			},
			{
				assetId: partner.id,
				userId,
				productionId: production?.id ?? null,
				action: 'SWAPPED',
				data: entry(scanned, partnerFrom, partnerTo)
			}
		]
	});

	return {
		partnerAssetId: partner.id,
		partnerLabel: unitLabel(partner),
		joined: partnerFrom?.name ?? '',
		partnerTo: partnerTo?.name ?? null
	};
}
