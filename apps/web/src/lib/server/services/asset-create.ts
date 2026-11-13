import { prisma } from '#lib/server/auth.js';
import type { Prisma } from '#lib/prisma/client.js';
import { appError } from '#lib/errors.js';
import { productLabel } from '#lib/product-label.js';
import { ACTIVE_ASSET_WHERE, BOOKABLE_ASSET_WHERE } from '#lib/asset-status.js';
import { tagAllocator } from '#lib/server/services/tag-counter.js';
import { kitHoldingTag } from '#lib/server/services/asset-lookup.js';
import { CABLE_ENDS } from '#lib/server/services/cable-ends.js';
import { initialInspection, type InitialInspection } from '#lib/server/services/inspections.js';
import { assertAdditionsFitType } from '#lib/server/services/bundle-spec.js';

// Creating units, shared by the web's `createAssets` / `createCableBatch` and
// `/api/v1/assets/untagged`, so a unit registered from either surface starts out
// the same: its org's inspection intervals, its tag (or none), its CREATED entry
// and, where asked for, its accessories. Framework-agnostic like `checkout.ts` —
// the caller checks who may, and decides what to refresh.

// Every list of units, everywhere, comes out in this order. Product name alone
// is not an order: a rack of twelve identical units ties on it, and Postgres
// breaks a tie in whatever order it happened to read the rows — which changes
// as soon as one of them is updated. The tag and then the id settle it, so a
// list looks the same on the second visit as on the first.
export const ASSET_ORDER_BY: Prisma.AssetOrderByWithRelationInput[] = [
	{ product: { name: 'asc' } },
	// Untagged units sort after tagged ones rather than being scattered through
	// them; Postgres would put NULLs last here anyway, but only by default.
	{ assetTag: { sort: 'asc', nulls: 'last' } },
	{ id: 'asc' }
];

export function assetLabel(asset: {
	assetTag: string | null;
	product: { name: string; manufacturer: { name: string } | null };
}) {
	const name = productLabel(asset.product);
	return asset.assetTag ? `${name} (${asset.assetTag})` : name;
}

/**
 * What each new unit is to be given, per accessory product — the part of the
 * remote's `ProductAccessoryProfile` that creating units reads.
 */
export type UnitAccessoryProfile = {
	accessories: { productId: string; perUnit: number; tagged: boolean }[];
};

/** The subset of a Prisma client these helpers need — the real one or a `$transaction` handle. */
export type AssetTx = Pick<
	typeof prisma,
	| 'asset'
	| 'organization'
	| 'assetTransaction'
	| 'product'
	| 'inspectionType'
	| 'orgInspectionInterval'
	| 'orgProductInspectionInterval'
	| '$queryRaw'
>;

/** One unit as a caller asks for it — a tag it brought, one to allocate, or none. */
export type UnitSpec = {
	productId: string;
	serialNumber?: string | null;
	assetTag?: string | null;
	noAssetTag?: boolean;
};

export type CreateUnitsArgs = {
	userId: string;
	organizationId: string;
	/** Already resolved and checked against the org by the caller. */
	locationId: string;
	units: UnitSpec[];
	parent?: (AccessoryParent & { productId: string }) | null;
	bundleId?: string | null;
	accessoryProfile?: UnitAccessoryProfile | null;
	/**
	 * Bolt loose units the pool already holds onto the new ones before
	 * registering any. Off by default, and deliberately the opposite default to
	 * the fan-out on the asset detail page: a unit being registered now is
	 * usually a delivery, and a delivery arrives with its own cables. Bringing an
	 * existing fleet into line is the other way round — see `addProductAccessories`.
	 */
	reuseAccessoryStock?: boolean;
};

/**
 * Creates units, in one transaction, with everything that has to happen at the
 * same moment: the org's inspection interval snapshotted onto each one, tags
 * drawn in row order from a single allocator, the CREATED (and, for an
 * accessory, ACCESSORY_ATTACHED) transactions, and the accessory fan-out.
 *
 * Extracted because the cable batch is the third caller. Two copies of tag
 * allocation is how one batch hands the same number to two units.
 */
export async function createUnitsInTx(tx: AssetTx, args: CreateUnitsArgs) {
	const { assetIdPrefix: prefix } = await tx.organization.findUniqueOrThrow({
		where: { id: args.organizationId },
		select: { assetIdPrefix: true }
	});
	// The org's interval, for products that need DGUV inspections — see `initialInspection`.
	const inspection = await initialInspection(tx, args.organizationId);

	const tags = await tagAllocator(
		tx,
		args.organizationId,
		args.units.map((unit) => unit.assetTag)
	);
	const parent = args.parent ?? null;

	// The column is unique, but a violation would surface as a bare 500 — say
	// which unit already carries a typed tag, the way `updateAsset` does.
	const typedTags = args.units.flatMap((u) => (!u.noAssetTag && u.assetTag?.trim()) || []);
	const repeated = typedTags.find((tag, i) => typedTags.indexOf(tag) !== i);
	if (repeated) appError(409, 'asset_tag_in_use', [repeated, 'another row of this form']);
	const holder = typedTags.length
		? await tx.asset.findFirst({
				where: { assetTag: { in: typedTags } },
				select: { assetTag: true, serialNumber: true, product: { select: { name: true } } }
			})
		: null;
	if (holder) {
		const label = holder.serialNumber
			? `${holder.product.name} (S/N ${holder.serialNumber})`
			: holder.product.name;
		appError(409, 'asset_tag_in_use', [holder.assetTag ?? '', label]);
	}
	const kitHolder = await kitHoldingTag(typedTags);
	if (kitHolder) appError(409, 'asset_tag_in_use', [kitHolder.tag, kitHolder.name]);

	const created = await Promise.all(
		// `tags.next()` is called synchronously inside the map, before anything
		// is awaited, so the tags land in row order rather than completion order.
		// With the org's numbering off it refuses a unit that brought no tag.
		args.units.map((unit) => {
			let resolvedTag: string | null;
			if (unit.noAssetTag) {
				resolvedTag = null;
			} else if (unit.assetTag?.trim()) {
				const tag = unit.assetTag.trim();
				if (!tag.startsWith(prefix)) appError(400, 'asset_tag_prefix_mismatch', [tag, prefix]);
				resolvedTag = tag;
			} else {
				resolvedTag = tags.next();
			}

			return tx.asset.create({
				data: {
					organizationId: args.organizationId,
					productId: unit.productId,
					locationId: args.locationId,
					serialNumber: unit.serialNumber || null,
					assetTag: resolvedTag,
					status: 'AVAILABLE',
					parentAssetId: parent?.id ?? null,
					bundleId: parent?.bundleId ?? args.bundleId ?? null,
					// Snapshot of the org's intervals, not a live reference — see OrgInspectionInterval.
					...inspection(unit.productId),
					transactions: {
						create: [
							{ userId: args.userId, action: 'CREATED', data: { type: 'CREATED' } },
							// Two entries rather than one: the unit was created, and it was
							// attached. Detaching it later leaves the first one true.
							...(parent
								? [
										{
											userId: args.userId,
											action: 'ACCESSORY_ATTACHED',
											data: {
												type: 'ACCESSORY_ATTACHED',
												parentAssetId: parent.id,
												parentLabel: assetLabel(parent)
											}
										}
									]
								: [])
						]
					}
				},
				include: {
					product: {
						include: { manufacturer: true, category: true, ...CABLE_ENDS }
					},
					location: true
				}
			});
		})
	);

	// In the same transaction as the units themselves: a fixture that reaches
	// the pool without the brackets every other one of its kind has is worse
	// than one that was never created — nothing about it looks wrong later.
	const reusedAccessoryIds: string[] = [];
	if (args.accessoryProfile) {
		const pool = args.reuseAccessoryStock
			? await stockPool(tx, {
					organizationId: args.organizationId,
					productIds: args.accessoryProfile.accessories.map((acc) => acc.productId),
					bundleId: parent?.bundleId ?? args.bundleId ?? null,
					locationId: args.locationId,
					bare: true
				})
			: new Map<string, StockUnit[]>();

		for (const unit of created) {
			for (const acc of args.accessoryProfile.accessories) {
				for (let n = 0; n < acc.perUnit; n++) {
					const parentRecord = {
						id: unit.id,
						locationId: unit.locationId,
						bundleId: unit.bundleId,
						assetTag: unit.assetTag,
						product: unit.product
					};
					const taken = pool.get(acc.productId)?.shift();
					if (taken && (await attachStockUnit(tx, args.userId, taken.id, parentRecord))) {
						reusedAccessoryIds.push(taken.id);
						continue;
					}
					await createAccessoryRecord(tx, {
						userId: args.userId,
						organizationId: args.organizationId,
						productId: acc.productId,
						// A tagged original begets a tagged copy — where the org numbers.
						assetTag: acc.tagged && tags.enabled ? tags.next() : null,
						inspection: inspection(acc.productId),
						parent: parentRecord
					});
				}
			}
		}
	}

	await tags.done();

	// The units themselves, and separately whatever was taken off the shelf to
	// dress them — the caller decides what to invalidate, the same way
	// `performScan` reports what it touched.
	return { created, reusedAccessoryIds };
}

/** What `createAccessoryRecord` needs to know about the unit it is attaching to. */
export type AccessoryParent = {
	id: string;
	locationId: string;
	bundleId: string | null;
	assetTag: string | null;
	product: { name: string; manufacturer: { name: string } | null };
};

/**
 * One accessory, created already attached — the shape both fan-out paths need.
 * It inherits its parent's location and kit for the same reason `attachAccessory`
 * writes them: those two columns are the parent's to decide.
 */
export function createAccessoryRecord(
	tx: AssetTx,
	args: {
		userId: string;
		organizationId: string;
		productId: string;
		assetTag: string | null;
		inspection: InitialInspection;
		parent: AccessoryParent;
	}
) {
	return tx.asset.create({
		data: {
			organizationId: args.organizationId,
			productId: args.productId,
			locationId: args.parent.locationId,
			assetTag: args.assetTag,
			status: 'AVAILABLE',
			parentAssetId: args.parent.id,
			bundleId: args.parent.bundleId,
			...args.inspection,
			transactions: {
				create: [
					{ userId: args.userId, action: 'CREATED', data: { type: 'CREATED' } },
					{
						userId: args.userId,
						action: 'ACCESSORY_ATTACHED',
						data: {
							type: 'ACCESSORY_ATTACHED',
							parentAssetId: args.parent.id,
							parentLabel: assetLabel(args.parent)
						}
					}
				]
			}
		},
		select: { id: true }
	});
}

/** A production still has a claim on the unit; a returned line is done with it. */
export const COMMITTED_ITEM_STATUSES = ['PENDING', 'APPROVED', 'CHECKED_OUT'];

/** What a unit has to say about itself to be attached, or attached to. */
export const STOCK_UNIT_SELECT = {
	id: true,
	productId: true,
	locationId: true,
	bundleId: true,
	assetTag: true,
	product: { select: { name: true, manufacturer: { select: { name: true } } } },
	// What it already carries, so a unit that comes off the shelf dressed is
	// only topped up to what is wanted rather than dressed twice.
	accessories: { where: ACTIVE_ASSET_WHERE, select: { productId: true } }
} satisfies Prisma.AssetSelect;

export type StockUnit = Prisma.AssetGetPayload<{ select: typeof STOCK_UNIT_SELECT }>;

/**
 * Loose stock of these products, grouped by product and ordered the way it
 * should be spent. Same shelf first: taking a unit relocates it, which is right
 * for a cable on the same shelf and merely optimistic for one in another
 * warehouse.
 *
 * Not limited to what is needed, because the premise of taking stock at all is
 * that there is a modest pile of it — and a limit would have to be applied per
 * product, in SQL, before the ordering this does in memory.
 */
export async function stockPool(
	client: Pick<typeof prisma, 'asset'>,
	args: {
		organizationId: string;
		productIds: string[];
		/** Where the units are headed, for the same-shelf preference. */
		locationId: string;
		/** The kit they are joining, if any: a candidate already in it is fine. */
		bundleId?: string | null;
		/** Candidates must carry nothing of their own — an accessory has none. */
		bare?: boolean;
		/** Promised to something else earlier in this same run. */
		excludeIds?: string[];
	}
): Promise<Map<string, StockUnit[]>> {
	const byProduct = new Map<string, StockUnit[]>();
	if (args.productIds.length === 0) return byProduct;

	const units = await client.asset.findMany({
		where: {
			productId: { in: args.productIds },
			organizationId: args.organizationId,
			parentAssetId: null,
			productionItems: { none: { status: { in: COMMITTED_ITEM_STATUSES } } },
			// Loose, or already in the kit it would be joining — anything else
			// would have to be pulled out of somebody else's case.
			OR: [{ bundleId: null }, ...(args.bundleId ? [{ bundleId: args.bundleId }] : [])],
			...(args.bare ? { accessories: { none: {} } } : {}),
			...(args.excludeIds?.length ? { id: { notIn: args.excludeIds } } : {}),
			...BOOKABLE_ASSET_WHERE
		},
		select: STOCK_UNIT_SELECT,
		orderBy: ASSET_ORDER_BY
	});

	for (const unit of units) {
		const list = byProduct.get(unit.productId);
		if (list) list.push(unit);
		else byProduct.set(unit.productId, [unit]);
	}
	for (const list of byProduct.values()) {
		list.sort(
			(a, b) => Number(b.locationId === args.locationId) - Number(a.locationId === args.locationId)
		);
	}
	return byProduct;
}

/**
 * Bolt a unit that already exists onto a parent, reporting whether it worked.
 *
 * The pool it came from was read before the write, so `parentAssetId` is in the
 * where clause rather than trusted: somebody attaching the same cable by hand
 * in the meantime must win, and the caller makes a new one instead of quietly
 * undoing their work.
 */
export async function attachStockUnit(
	tx: AssetTx,
	userId: string,
	unitId: string,
	parent: AccessoryParent
): Promise<boolean> {
	const { count } = await tx.asset.updateMany({
		where: { id: unitId, parentAssetId: null },
		data: { parentAssetId: parent.id, locationId: parent.locationId, bundleId: parent.bundleId }
	});
	if (count !== 1) return false;

	await tx.assetTransaction.create({
		data: {
			assetId: unitId,
			userId,
			action: 'ACCESSORY_ATTACHED',
			data: {
				type: 'ACCESSORY_ATTACHED',
				parentAssetId: parent.id,
				parentLabel: assetLabel(parent)
			}
		}
	});
	return true;
}

/**
 * The kit new units are created straight into, checked the way every way in
 * checks it: the kit is the org's own, and what goes in fits its type
 * (`assertAdditionsFitType`, no override — registering into a kit is how one
 * is completed, and a new product belongs to the type before it belongs to a
 * case of it). Its own location wins over the caller's, which is the caller's
 * to apply; a kit with none leaves the choice open.
 */
export async function kitForNewUnits(args: {
	bundleId: string;
	organizationId: string;
	/** One entry per unit being created. */
	productIds: string[];
}) {
	const bundle = await prisma.assetBundle.findUnique({
		where: { id: args.bundleId },
		select: {
			id: true,
			locationId: true,
			templateId: true,
			template: { select: { organizationId: true } }
		}
	});
	if (!bundle) appError(404, 'record_not_found');
	if (bundle.template.organizationId !== args.organizationId) {
		appError(409, 'bundle_org_mismatch');
	}
	await assertAdditionsFitType({
		templateId: bundle.templateId,
		bundleId: bundle.id,
		productIds: args.productIds
	});
	return bundle;
}
