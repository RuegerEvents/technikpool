import { prisma } from '$lib/server/auth';
import type { Prisma } from '$lib/prisma/client';
import {
	isSystemAdmin,
	productionVisibility,
	userOrgIds,
	visibleProductionName,
	writableOrgIds
} from './access';
import { ACTIVE_ASSET_WHERE, isRetiredStatus, type AssetStatus } from '$lib/asset-status';
import { resolveScannedCode } from './asset-lookup';
import { syncAccessories } from './accessories';

// Stocktakes (Inventur): counting what an org actually has against what it
// should have. Framework-agnostic like checkout.ts, so the web's remote
// functions and /api/v1 share one set of rules — they take a user id and throw
// a StocktakeError, and each surface turns that into its own error shape.
//
// The shape of it:
//
// - Starting one takes a *snapshot* of the units its scope matches. A unit is
//   a StocktakeItem of its own when it can be told apart from its siblings —
//   it has a tag, or is an accessory, a bundle member or has accessories — and
//   is otherwise part of a StocktakeLine, a number per product and location.
//   Units checked out at the snapshot are accounted for, not missing.
// - Counting ticks items and enters per-counter counts. Nothing about an asset
//   changes while a stocktake is open; each counter may only undo their own.
// - Closing freezes it and writes one STOCKTAKE_COUNTED entry per unit into
//   the asset history. The status/location corrections are separate actions
//   on the closed report, each applied at most once.

export type StocktakeScope = {
	locationIds: string[];
	categoryIds: string[];
	productIds: string[];
};

export const STOCKTAKE_ACTIONS = [
	'mark_missing_unavailable',
	'restore_found_available',
	'move_found',
	'flag_maintenance',
	'flag_broken'
] as const;
export type StocktakeAction = (typeof STOCKTAKE_ACTIONS)[number];

/** How a tick came about, for the report and the event log. */
export type FoundVia = 'scan' | 'manual' | 'parent' | 'bundle';

/**
 * Why a unit that was scanned is not on the expected list. `added_later` is a
 * unit registered after the snapshot; `out_of_scope` is anything the filter
 * did not ask for (another category, or not among a recount's gaps).
 */
export type UnexpectedReason =
	'other_org' | 'retired' | 'added_later' | 'other_location' | 'out_of_scope';

export class StocktakeError extends Error {
	constructor(
		readonly code:
			| 'stocktake_not_found'
			| 'stocktake_closed'
			| 'stocktake_not_closed'
			| 'stocktake_empty'
			| 'stocktake_action_applied'
			| 'stocktake_not_your_tick'
			| 'stocktake_not_found_yet'
			| 'stocktake_product_not_counted'
			| 'asset_not_found'
			| 'serial_ambiguous'
			| 'forbidden'
			| 'wrong_organization'
			| 'invalid_request',
		message: string,
		/** Interpolated into the translated message — a tag, a name. */
		readonly param?: string
	) {
		super(message);
		this.name = 'StocktakeError';
	}
}

export const STOCKTAKE_ERROR_STATUS: Record<StocktakeError['code'], number> = {
	stocktake_not_found: 404,
	stocktake_closed: 409,
	stocktake_not_closed: 409,
	stocktake_empty: 409,
	stocktake_action_applied: 409,
	stocktake_not_your_tick: 403,
	stocktake_not_found_yet: 409,
	stocktake_product_not_counted: 409,
	asset_not_found: 404,
	serial_ambiguous: 409,
	forbidden: 403,
	wrong_organization: 403,
	invalid_request: 400
};

// ---------------------------------------------------------------------------
// Access

async function canWrite(userId: string, organizationId: string) {
	if (await isSystemAdmin(userId)) return true;
	return (await writableOrgIds(userId)).includes(organizationId);
}

/** Every stocktake question starts here: it exists, and the caller belongs to its org. */
async function loadForRead(userId: string, stocktakeId: string) {
	const stocktake = await prisma.stocktake.findUnique({ where: { id: stocktakeId } });
	if (!stocktake) {
		throw new StocktakeError('stocktake_not_found', 'Stocktake not found');
	}
	if (
		!(await isSystemAdmin(userId)) &&
		!(await userOrgIds(userId)).includes(stocktake.organizationId)
	) {
		// Indistinguishable from a missing one on purpose: another org's
		// stocktakes are nobody else's business, not even their existence.
		throw new StocktakeError('stocktake_not_found', 'Stocktake not found');
	}
	return stocktake;
}

/** Counting, closing and acting on a report: MEMBER of the org. */
async function loadForWrite(userId: string, stocktakeId: string) {
	const stocktake = await loadForRead(userId, stocktakeId);
	if (!(await canWrite(userId, stocktake.organizationId))) {
		throw new StocktakeError('forbidden', 'Only members of this organization can count');
	}
	return stocktake;
}

async function loadOpenForWrite(userId: string, stocktakeId: string) {
	const stocktake = await loadForWrite(userId, stocktakeId);
	if (stocktake.status !== 'OPEN') {
		throw new StocktakeError('stocktake_closed', 'This stocktake is closed', stocktake.name);
	}
	return stocktake;
}

/** A counter's location has to be one of the stocktake's org. */
async function assertCountingLocation(organizationId: string, locationId: string) {
	const location = await prisma.location.findUnique({
		where: { id: locationId },
		select: { id: true, name: true, organizationId: true }
	});
	if (!location) throw new StocktakeError('invalid_request', 'Unknown location');
	if (location.organizationId !== organizationId) {
		throw new StocktakeError('wrong_organization', 'Location belongs to a different organisation');
	}
	return location;
}

// ---------------------------------------------------------------------------
// Snapshot

export function parseScope(value: unknown): StocktakeScope {
	const v = (value ?? {}) as Partial<Record<keyof StocktakeScope, unknown>>;
	const list = (x: unknown) =>
		Array.isArray(x) ? x.filter((i): i is string => typeof i === 'string') : [];
	return {
		locationIds: list(v.locationIds),
		categoryIds: list(v.categoryIds),
		productIds: list(v.productIds)
	};
}

type SnapshotItem = {
	assetId: string;
	expectedLocationId: string;
	outProductionId: string | null;
	outProductionName: string | null;
};

type SnapshotLine = { productId: string; locationId: string; expected: number; out: number };

type Snapshot = { items: SnapshotItem[]; lines: SnapshotLine[] };

/**
 * Turns a set of units into the snapshot rows. Accessories come along with the
 * units they hang off regardless of the filter — they live wherever their
 * parent is, and a case filed under "Cases" is still part of the fixture.
 */
async function snapshotOf(userId: string, where: Prisma.AssetWhereInput): Promise<Snapshot> {
	const top = await prisma.asset.findMany({
		where: { ...where, ...ACTIVE_ASSET_WHERE },
		select: {
			id: true,
			assetTag: true,
			bundleId: true,
			parentAssetId: true,
			productId: true,
			locationId: true
		}
	});
	const topIds = new Set(top.map((a) => a.id));
	const accessories = await prisma.asset.findMany({
		where: { parentAssetId: { in: [...topIds] }, ...ACTIVE_ASSET_WHERE },
		select: {
			id: true,
			assetTag: true,
			bundleId: true,
			parentAssetId: true,
			productId: true,
			locationId: true
		}
	});
	const all = [...top, ...accessories.filter((a) => !topIds.has(a.id))];
	const hasAccessories = new Set(accessories.map((a) => a.parentAssetId));

	const checkedOut = await prisma.productionItem.findMany({
		where: { assetId: { in: all.map((a) => a.id) }, status: 'CHECKED_OUT' },
		select: {
			assetId: true,
			production: {
				select: {
					id: true,
					name: true,
					organizationId: true,
					organization: { select: { name: true, shortName: true } }
				}
			}
		}
	});
	const canSee = await productionVisibility(userId);
	const outOf = new Map(
		checkedOut.map((c) => [
			c.assetId,
			{ id: c.production.id, name: visibleProductionName(c.production, canSee) }
		])
	);

	const items: SnapshotItem[] = [];
	const lines = new Map<string, SnapshotLine>();
	for (const a of all) {
		const out = outOf.get(a.id);
		const individual =
			!!a.assetTag || !!a.bundleId || !!a.parentAssetId || hasAccessories.has(a.id);
		if (individual) {
			items.push({
				assetId: a.id,
				expectedLocationId: a.locationId,
				outProductionId: out?.id ?? null,
				outProductionName: out?.name ?? null
			});
			continue;
		}
		const key = `${a.productId}|${a.locationId}`;
		const line = lines.get(key) ?? {
			productId: a.productId,
			locationId: a.locationId,
			expected: 0,
			out: 0
		};
		if (out) line.out += 1;
		else line.expected += 1;
		lines.set(key, line);
	}
	return { items, lines: [...lines.values()] };
}

function scopeWhere(organizationId: string, scope: StocktakeScope): Prisma.AssetWhereInput {
	return {
		organizationId,
		parentAssetId: null,
		...(scope.locationIds.length > 0 ? { locationId: { in: scope.locationIds } } : {}),
		...(scope.productIds.length > 0 ? { productId: { in: scope.productIds } } : {}),
		...(scope.categoryIds.length > 0 ? { product: { categoryId: { in: scope.categoryIds } } } : {})
	};
}

/** The open stocktakes of an org that share units or counted products with a snapshot. */
async function overlapsWith(organizationId: string, snapshot: Snapshot, excludeId?: string) {
	const open = await prisma.stocktake.findMany({
		where: { organizationId, status: 'OPEN', ...(excludeId ? { id: { not: excludeId } } : {}) },
		select: { id: true, name: true }
	});
	if (open.length === 0) return [];

	const assetIds = snapshot.items.map((i) => i.assetId);
	const shared = await prisma.stocktakeItem.groupBy({
		by: ['stocktakeId'],
		where: {
			stocktakeId: { in: open.map((s) => s.id) },
			expected: true,
			assetId: { in: assetIds }
		},
		_count: { _all: true }
	});
	const sharedLines = await prisma.stocktakeLine.findMany({
		where: {
			stocktakeId: { in: open.map((s) => s.id) },
			OR: snapshot.lines.map((l) => ({ productId: l.productId, locationId: l.locationId }))
		},
		select: { stocktakeId: true, expected: true }
	});

	return open
		.map((s) => ({
			id: s.id,
			name: s.name,
			sharedUnits:
				(shared.find((g) => g.stocktakeId === s.id)?._count._all ?? 0) +
				sharedLines.filter((l) => l.stocktakeId === s.id).reduce((n, l) => n + l.expected, 0)
		}))
		.filter((s) => s.sharedUnits > 0);
}

function snapshotTotals(snapshot: Snapshot) {
	return {
		units: snapshot.items.filter((i) => !i.outProductionId).length,
		looseUnits: snapshot.lines.reduce((n, l) => n + l.expected, 0),
		out:
			snapshot.items.filter((i) => i.outProductionId).length +
			snapshot.lines.reduce((n, l) => n + l.out, 0)
	};
}

export async function previewStocktake(
	userId: string,
	input: { organizationId: string; scope: StocktakeScope }
) {
	if (!(await canWrite(userId, input.organizationId))) {
		throw new StocktakeError(
			'forbidden',
			'Only members of this organization can start a stocktake'
		);
	}
	const snapshot = await snapshotOf(userId, scopeWhere(input.organizationId, input.scope));
	return {
		...snapshotTotals(snapshot),
		overlaps: await overlapsWith(input.organizationId, snapshot)
	};
}

async function defaultName(organizationId: string, scope: StocktakeScope, prefix: string) {
	const date = new Date().toLocaleDateString('de-DE', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric'
	});
	if (scope.locationIds.length === 0) return `${prefix} ${date}`;
	const locations = await prisma.location.findMany({
		where: { id: { in: scope.locationIds }, organizationId },
		select: { name: true },
		orderBy: { name: 'asc' }
	});
	return `${prefix} ${date} – ${locations.map((l) => l.name).join(', ')}`;
}

async function persist(
	userId: string,
	data: {
		organizationId: string;
		name: string;
		scope: StocktakeScope;
		recountOfId?: string;
	},
	snapshot: Snapshot
) {
	if (snapshot.items.length === 0 && snapshot.lines.length === 0) {
		throw new StocktakeError('stocktake_empty', 'Nothing matches this selection');
	}
	return await prisma.$transaction(async (tx) => {
		const stocktake = await tx.stocktake.create({
			data: {
				organizationId: data.organizationId,
				name: data.name,
				scope: data.scope,
				recountOfId: data.recountOfId,
				createdById: userId
			}
		});
		await tx.stocktakeItem.createMany({
			data: snapshot.items.map((i) => ({ ...i, stocktakeId: stocktake.id, expected: true }))
		});
		await tx.stocktakeLine.createMany({
			data: snapshot.lines.map((l) => ({ ...l, stocktakeId: stocktake.id }))
		});
		return stocktake;
	});
}

export async function createStocktake(
	userId: string,
	input: { organizationId: string; name?: string | null; scope: StocktakeScope }
) {
	if (!(await canWrite(userId, input.organizationId))) {
		throw new StocktakeError(
			'forbidden',
			'Only members of this organization can start a stocktake'
		);
	}
	// Scope ids from another org would only ever match nothing, but they would
	// also be shown back as the stocktake's filter.
	const [locations, categories, products] = await Promise.all([
		prisma.location.count({
			where: { id: { in: input.scope.locationIds }, organizationId: input.organizationId }
		}),
		prisma.category.count({ where: { id: { in: input.scope.categoryIds } } }),
		prisma.product.count({ where: { id: { in: input.scope.productIds } } })
	]);
	if (
		locations !== input.scope.locationIds.length ||
		categories !== input.scope.categoryIds.length ||
		products !== input.scope.productIds.length
	) {
		throw new StocktakeError(
			'invalid_request',
			'Unknown location, category or product in the scope'
		);
	}

	const snapshot = await snapshotOf(userId, scopeWhere(input.organizationId, input.scope));
	const name =
		input.name?.trim() || (await defaultName(input.organizationId, input.scope, 'Inventur'));
	return await persist(
		userId,
		{ organizationId: input.organizationId, name, scope: input.scope },
		snapshot
	);
}

/**
 * A new stocktake of a closed one's gaps: its missing units as they are now
 * (they may have been moved since), and every product whose count came up
 * short, recounted from scratch — loose units have no identity to recount
 * one by one.
 */
export async function createRecount(userId: string, stocktakeId: string, name?: string | null) {
	const original = await loadForWrite(userId, stocktakeId);
	if (original.status !== 'CLOSED') {
		throw new StocktakeError('stocktake_not_closed', 'Close the stocktake before recounting it');
	}
	const [missing, lines, counts] = await Promise.all([
		prisma.stocktakeItem.findMany({
			where: { stocktakeId, expected: true, foundAt: null, outProductionId: null },
			select: { assetId: true }
		}),
		prisma.stocktakeLine.findMany({ where: { stocktakeId } }),
		prisma.stocktakeCount.findMany({ where: { stocktakeId } })
	]);

	const shortProducts = new Set<string>();
	for (const productId of new Set(lines.map((l) => l.productId))) {
		const expected = lines
			.filter((l) => l.productId === productId)
			.reduce((n, l) => n + l.expected, 0);
		const counted = counts
			.filter((c) => c.productId === productId)
			.reduce((n, c) => n + c.count, 0);
		if (counted < expected) shortProducts.add(productId);
	}
	const lineLocations = lines.filter((l) => shortProducts.has(l.productId));

	const byId = await snapshotOf(userId, {
		id: { in: missing.map((m) => m.assetId) },
		organizationId: original.organizationId
	});
	const loose = lineLocations.length
		? await snapshotOf(userId, {
				organizationId: original.organizationId,
				OR: lineLocations.map((l) => ({ productId: l.productId, locationId: l.locationId })),
				parentAssetId: null
			})
		: { items: [], lines: [] };

	// snapshotOf by id pulls in accessories of the missing units too, which were
	// either found (and don't need recounting) or are missing and in the list.
	const missingIds = new Set(missing.map((m) => m.assetId));
	const snapshot: Snapshot = {
		items: byId.items.filter((i) => missingIds.has(i.assetId)),
		lines: loose.lines.filter((l) => shortProducts.has(l.productId))
	};

	const date = new Date().toLocaleDateString('de-DE', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric'
	});
	return await persist(
		userId,
		{
			organizationId: original.organizationId,
			name: name?.trim() || `${original.name} – Nachzählung ${date}`,
			scope: parseScope(original.scope),
			recountOfId: original.id
		},
		snapshot
	);
}

// ---------------------------------------------------------------------------
// Reading

const ITEM_INCLUDE = {
	asset: {
		select: {
			id: true,
			assetTag: true,
			serialNumber: true,
			status: true,
			parentAssetId: true,
			bundleId: true,
			organizationId: true,
			locationId: true,
			organization: { select: { name: true, shortName: true } },
			bundle: { select: { tag: true, template: { select: { name: true } } } },
			product: {
				select: {
					id: true,
					name: true,
					imagePath: true,
					manufacturer: { select: { name: true } },
					category: {
						select: { id: true, name: true, nameDe: true, color: true, sortOrder: true }
					}
				}
			}
		}
	},
	expectedLocation: { select: { id: true, name: true } },
	foundLocation: { select: { id: true, name: true } },
	foundBy: { select: { id: true, name: true, email: true } }
} satisfies Prisma.StocktakeItemInclude;

export type StocktakeItemRow = Prisma.StocktakeItemGetPayload<{ include: typeof ITEM_INCLUDE }>;

export type ItemState = 'open' | 'found' | 'out' | 'missing' | 'unexpected';

/** Where a unit stands. `missing` only exists once the stocktake is closed; before that it is `open`. */
export function itemState(
	item: { expected: boolean; foundAt: Date | null; outProductionId: string | null },
	closed: boolean
): ItemState {
	if (!item.expected) return 'unexpected';
	if (item.foundAt) return 'found';
	if (item.outProductionId) return 'out';
	return closed ? 'missing' : 'open';
}

function progressOf(
	items: { expected: boolean; foundAt: Date | null; outProductionId: string | null }[],
	lines: { productId: string; expected: number; out: number }[],
	counts: { productId: string; count: number }[]
) {
	const expectedItems = items.filter((i) => i.expected && !i.outProductionId);
	const foundItems = expectedItems.filter((i) => i.foundAt).length;
	// A found unit that was out still counts as found, not as out.
	const out =
		items.filter((i) => i.expected && i.outProductionId && !i.foundAt).length +
		lines.reduce((n, l) => n + l.out, 0);

	let expectedLoose = 0;
	let countedLoose = 0;
	for (const productId of new Set(lines.map((l) => l.productId))) {
		const expected = lines
			.filter((l) => l.productId === productId)
			.reduce((n, l) => n + l.expected, 0);
		const counted = counts
			.filter((c) => c.productId === productId)
			.reduce((n, c) => n + c.count, 0);
		expectedLoose += expected;
		// Surplus of one product does not make up for a shortfall of another.
		countedLoose += Math.min(expected, counted);
	}

	return {
		expected: expectedItems.length + expectedLoose,
		found: foundItems + countedLoose,
		out,
		unexpected: items.filter((i) => !i.expected).length
	};
}

export async function listStocktakes(
	userId: string,
	filter: { status?: 'OPEN' | 'CLOSED'; id?: string } = {}
) {
	const orgIds = (await isSystemAdmin(userId)) ? null : await userOrgIds(userId);
	const stocktakes = await prisma.stocktake.findMany({
		where: {
			...(orgIds ? { organizationId: { in: orgIds } } : {}),
			...(filter.status ? { status: filter.status } : {}),
			...(filter.id ? { id: filter.id } : {})
		},
		include: {
			organization: {
				select: { id: true, name: true, shortName: true, color: true, avatarLabel: true }
			},
			createdBy: { select: { name: true, email: true } },
			closedBy: { select: { name: true, email: true } },
			items: { select: { expected: true, foundAt: true, outProductionId: true } },
			lines: { select: { productId: true, expected: true, out: true } },
			counts: { select: { productId: true, count: true } }
		},
		orderBy: [{ status: 'desc' }, { createdAt: 'desc' }]
	});
	const locations = await prisma.location.findMany({
		where: { organizationId: { in: [...new Set(stocktakes.map((s) => s.organizationId))] } },
		select: { id: true, name: true, organizationId: true },
		orderBy: { name: 'asc' }
	});
	return stocktakes.map(({ items, lines, counts, ...s }) => {
		const scope = parseScope(s.scope);
		return {
			...s,
			scope,
			countingLocations: countingLocationsOf(s.organizationId, scope, locations),
			progress: progressOf(items, lines, counts)
		};
	});
}

/** Where a counter can say they are: the scope's locations, or all of the org's when it names none. */
function countingLocationsOf(
	organizationId: string,
	scope: StocktakeScope,
	locations: { id: string; name: string; organizationId: string }[]
) {
	return locations
		.filter(
			(l) =>
				l.organizationId === organizationId &&
				(scope.locationIds.length === 0 || scope.locationIds.includes(l.id))
		)
		.map(({ id, name }) => ({ id, name }));
}

export type StocktakeSummary = Awaited<ReturnType<typeof listStocktakes>>[number];

export async function getStocktakeSummary(userId: string, stocktakeId: string) {
	await loadForRead(userId, stocktakeId);
	const [summary] = await listStocktakes(userId, { id: stocktakeId });
	return summary;
}

export async function getStocktake(userId: string, stocktakeId: string) {
	await loadForRead(userId, stocktakeId);
	const stocktake = await prisma.stocktake.findUniqueOrThrow({
		where: { id: stocktakeId },
		include: {
			organization: {
				select: { id: true, name: true, shortName: true, color: true, avatarLabel: true }
			},
			createdBy: { select: { name: true, email: true } },
			closedBy: { select: { name: true, email: true } },
			recountOf: { select: { id: true, name: true } },
			recounts: { select: { id: true, name: true, status: true } },
			items: { include: ITEM_INCLUDE },
			lines: {
				include: {
					location: { select: { id: true, name: true } },
					product: {
						select: {
							id: true,
							name: true,
							imagePath: true,
							manufacturer: { select: { name: true } },
							category: {
								select: { id: true, name: true, nameDe: true, color: true, sortOrder: true }
							}
						}
					}
				}
			},
			counts: {
				include: {
					location: { select: { id: true, name: true } },
					user: { select: { id: true, name: true, email: true } }
				}
			}
		}
	});
	const scope = parseScope(stocktake.scope);
	const [locations, categories, products] = await Promise.all([
		// The locations a counter can say they are at: the scope's, or every one
		// of the org's when the scope names none.
		prisma.location.findMany({
			where: {
				organizationId: stocktake.organizationId,
				...(scope.locationIds.length > 0 ? { id: { in: scope.locationIds } } : {})
			},
			select: { id: true, name: true },
			orderBy: { name: 'asc' }
		}),
		prisma.category.findMany({
			where: { id: { in: scope.categoryIds } },
			select: { id: true, name: true, nameDe: true }
		}),
		prisma.product.findMany({
			where: { id: { in: scope.productIds } },
			select: { id: true, name: true }
		})
	]);
	return {
		...stocktake,
		scope,
		scopeNames: { categories, products },
		countingLocations: locations,
		progress: progressOf(stocktake.items, stocktake.lines, stocktake.counts)
	};
}

export type StocktakeDetail = Awaited<ReturnType<typeof getStocktake>>;

/**
 * Loose units per product: what was expected and counted where, and by whom.
 * Both surfaces show them this way, so it is worked out once.
 */
export function productCounts(detail: StocktakeDetail, userId: string) {
	const byProduct = new Map<
		string,
		{
			product: StocktakeDetail['lines'][number]['product'];
			expected: number;
			out: number;
			counted: number;
			locations: Map<
				string,
				{
					location: { id: string; name: string };
					expected: number;
					out: number;
					counted: number;
					myCount: number | null;
					counters: { name: string; count: number }[];
				}
			>;
		}
	>();

	for (const line of detail.lines) {
		const entry = byProduct.get(line.productId) ?? {
			product: line.product,
			expected: 0,
			out: 0,
			counted: 0,
			locations: new Map()
		};
		entry.expected += line.expected;
		entry.out += line.out;
		entry.locations.set(line.locationId, {
			location: line.location,
			expected: line.expected,
			out: line.out,
			counted: 0,
			myCount: null,
			counters: []
		});
		byProduct.set(line.productId, entry);
	}
	for (const count of detail.counts) {
		const entry = byProduct.get(count.productId);
		if (!entry) continue;
		entry.counted += count.count;
		const at = entry.locations.get(count.locationId) ?? {
			location: count.location,
			expected: 0,
			out: 0,
			counted: 0,
			myCount: null,
			counters: []
		};
		at.counted += count.count;
		at.counters.push({ name: count.user.name || count.user.email, count: count.count });
		if (count.userId === userId) at.myCount = count.count;
		entry.locations.set(count.locationId, at);
	}

	return [...byProduct.values()].map((p) => ({
		...p,
		locations: [...p.locations.values()].sort((a, b) =>
			a.location.name.localeCompare(b.location.name)
		)
	}));
}

export type ProductCount = ReturnType<typeof productCounts>[number];

// ---------------------------------------------------------------------------
// Counting

async function unexpectedReason(
	stocktake: { organizationId: string; createdAt: Date; scope: Prisma.JsonValue },
	asset: { organizationId: string; status: string; createdAt: Date; locationId: string }
): Promise<UnexpectedReason> {
	if (asset.organizationId !== stocktake.organizationId) return 'other_org';
	if (isRetiredStatus(asset.status)) return 'retired';
	if (asset.createdAt > stocktake.createdAt) return 'added_later';
	const scope = parseScope(stocktake.scope);
	if (scope.locationIds.length > 0 && !scope.locationIds.includes(asset.locationId)) {
		return 'other_location';
	}
	return 'out_of_scope';
}

/**
 * Tick units as found. Already found ones are left alone — whoever found a
 * unit first owns that tick — and a unit not on the list comes in as
 * unexpected. Returns what happened to each id.
 */
async function tick(
	userId: string,
	stocktake: { id: string; organizationId: string; createdAt: Date; scope: Prisma.JsonValue },
	assetIds: string[],
	locationId: string,
	via: FoundVia
) {
	const existing = await prisma.stocktakeItem.findMany({
		where: { stocktakeId: stocktake.id, assetId: { in: assetIds } },
		select: { id: true, assetId: true, foundAt: true }
	});
	const byAsset = new Map(existing.map((i) => [i.assetId, i]));
	const newIds = assetIds.filter((id) => !byAsset.has(id));
	const newAssets = await prisma.asset.findMany({
		where: { id: { in: newIds } },
		select: { id: true, organizationId: true, status: true, createdAt: true, locationId: true }
	});

	const now = new Date();
	const ticked: string[] = [];
	const already: string[] = [];
	await prisma.$transaction(async (tx) => {
		for (const assetId of assetIds) {
			const item = byAsset.get(assetId);
			if (item?.foundAt) {
				already.push(assetId);
				continue;
			}
			const found = { foundAt: now, foundById: userId, foundLocationId: locationId, foundVia: via };
			if (item) {
				await tx.stocktakeItem.update({ where: { id: item.id }, data: found });
			} else {
				const asset = newAssets.find((a) => a.id === assetId);
				if (!asset) continue;
				await tx.stocktakeItem.create({
					data: {
						stocktakeId: stocktake.id,
						assetId,
						expected: false,
						unexpectedReason: await unexpectedReason(stocktake, asset),
						...found
					}
				});
			}
			ticked.push(assetId);
		}
		if (ticked.length > 0) {
			await tx.stocktakeEvent.createMany({
				data: ticked.map((assetId) => ({
					stocktakeId: stocktake.id,
					userId,
					action: 'FOUND',
					assetId,
					locationId,
					data: { via }
				}))
			});
		}
	});
	return { ticked, already };
}

const CONFIRM_SELECT = {
	id: true,
	assetTag: true,
	product: { select: { name: true, manufacturer: { select: { name: true } } } }
} as const;

type ConfirmAsset = Prisma.AssetGetPayload<{ select: typeof CONFIRM_SELECT }>;

/** A unit offered for confirmation after a parent or a bundle was scanned. */
export type ConfirmEntry = {
	assetId: string;
	assetTag: string | null;
	productName: string;
	manufacturerName: string | null;
	foundByName: string | null;
};

async function confirmEntries(
	stocktakeId: string,
	assets: ConfirmAsset[]
): Promise<ConfirmEntry[]> {
	const items = await prisma.stocktakeItem.findMany({
		where: { stocktakeId, assetId: { in: assets.map((a) => a.id) }, foundAt: { not: null } },
		select: { assetId: true, foundBy: { select: { name: true, email: true } } }
	});
	return assets.map((a) => {
		const item = items.find((i) => i.assetId === a.id);
		return {
			assetId: a.id,
			assetTag: a.assetTag,
			productName: a.product.name,
			manufacturerName: a.product.manufacturer?.name ?? null,
			foundByName: item ? item.foundBy?.name || item.foundBy?.email || '—' : null
		};
	});
}

export type StocktakeScanOutcome =
	| {
			outcome: 'found' | 'unexpected';
			item: StocktakeItemRow;
			/** The unit was checked out at the snapshot and is here after all. */
			wasOutAt: string | null;
			/** Its accessories, to confirm in one go. */
			confirm: ConfirmEntry[];
	  }
	| { outcome: 'already'; item: StocktakeItemRow; foundByName: string; byMe: boolean }
	| {
			outcome: 'bundle';
			bundle: { id: string; tag: string | null; name: string };
			/** Its members, nothing ticked yet: opening the case is the point. */
			confirm: ConfirmEntry[];
	  };

/**
 * One scanned code. An asset tag (or a serial that picks out one unit) ticks
 * that unit and offers its accessories for confirmation; a bundle tag ticks
 * nothing and offers the members.
 */
export async function scanIntoStocktake(
	userId: string,
	stocktakeId: string,
	input: { code: string; locationId: string }
): Promise<StocktakeScanOutcome> {
	const stocktake = await loadOpenForWrite(userId, stocktakeId);
	await assertCountingLocation(stocktake.organizationId, input.locationId);
	const code = input.code.trim();

	const match = await resolveScannedCode(userId, code);
	if (match.kind === 'ambiguous') {
		throw new StocktakeError(
			'serial_ambiguous',
			`Serial number "${code}" is on more than one unit — scan the asset tag instead`,
			code
		);
	}

	if (match.kind === 'not_found') {
		const bundle = code
			? await prisma.assetBundle.findUnique({
					where: { tag: code },
					select: { id: true, tag: true, template: { select: { name: true } } }
				})
			: null;
		if (!bundle) throw new StocktakeError('asset_not_found', `Tag "${code}" not found`, code);
		const members = await prisma.asset.findMany({
			where: { bundleId: bundle.id, ...ACTIVE_ASSET_WHERE },
			select: CONFIRM_SELECT,
			orderBy: [{ product: { name: 'asc' } }, { assetTag: 'asc' }]
		});
		return {
			outcome: 'bundle',
			bundle: { id: bundle.id, tag: bundle.tag, name: bundle.template.name },
			confirm: await confirmEntries(stocktakeId, members)
		};
	}

	const itemOf = () =>
		prisma.stocktakeItem.findUniqueOrThrow({
			where: { stocktakeId_assetId: { stocktakeId, assetId: match.assetId } },
			include: ITEM_INCLUDE
		});

	const { already } = await tick(userId, stocktake, [match.assetId], input.locationId, 'scan');
	const item = await itemOf();
	if (already.length > 0) {
		return {
			outcome: 'already',
			item,
			foundByName: item.foundBy?.name || item.foundBy?.email || '—',
			byMe: item.foundById === userId
		};
	}

	const accessories = await prisma.asset.findMany({
		where: { parentAssetId: match.assetId, ...ACTIVE_ASSET_WHERE },
		select: CONFIRM_SELECT,
		orderBy: [{ product: { name: 'asc' } }, { assetTag: 'asc' }]
	});
	return {
		outcome: item.expected ? 'found' : 'unexpected',
		item,
		wasOutAt: item.outProductionName,
		confirm: await confirmEntries(stocktakeId, accessories)
	};
}

/** Ticks by hand, or confirms a parent's accessories or a bundle's members. */
export async function tickStocktakeItems(
	userId: string,
	stocktakeId: string,
	input: { assetIds: string[]; locationId: string; via: Exclude<FoundVia, 'scan'> }
) {
	const stocktake = await loadOpenForWrite(userId, stocktakeId);
	await assertCountingLocation(stocktake.organizationId, input.locationId);
	const { ticked, already } = await tick(
		userId,
		stocktake,
		[...new Set(input.assetIds)],
		input.locationId,
		input.via
	);
	return { ticked: ticked.length, alreadyFound: already.length };
}

async function ownFoundItem(userId: string, stocktakeId: string, assetId: string) {
	const item = await prisma.stocktakeItem.findUnique({
		where: { stocktakeId_assetId: { stocktakeId, assetId } }
	});
	if (!item?.foundAt) {
		throw new StocktakeError('stocktake_not_found_yet', 'This unit has not been counted');
	}
	if (item.foundById !== userId) {
		throw new StocktakeError(
			'stocktake_not_your_tick',
			'Only whoever counted a unit can change it'
		);
	}
	return item;
}

/**
 * Takes back one's own tick. An unexpected unit leaves the list with it: it
 * was only ever on it because someone scanned it.
 */
export async function untickStocktakeItem(userId: string, stocktakeId: string, assetId: string) {
	await loadOpenForWrite(userId, stocktakeId);
	const item = await ownFoundItem(userId, stocktakeId, assetId);
	await prisma.$transaction(async (tx) => {
		if (item.expected) {
			await tx.stocktakeItem.update({
				where: { id: item.id },
				data: {
					foundAt: null,
					foundById: null,
					foundLocationId: null,
					foundVia: null,
					note: null,
					needsAttention: false
				}
			});
		} else {
			await tx.stocktakeItem.delete({ where: { id: item.id } });
		}
		await tx.stocktakeEvent.create({
			data: { stocktakeId, userId, action: 'UNFOUND', assetId, locationId: item.foundLocationId }
		});
	});
}

export async function setStocktakeItemNote(
	userId: string,
	stocktakeId: string,
	input: { assetId: string; note: string | null; needsAttention: boolean }
) {
	await loadOpenForWrite(userId, stocktakeId);
	const item = await ownFoundItem(userId, stocktakeId, input.assetId);
	const note = input.note?.trim() || null;
	await prisma.$transaction([
		prisma.stocktakeItem.update({
			where: { id: item.id },
			data: { note, needsAttention: input.needsAttention }
		}),
		prisma.stocktakeEvent.create({
			data: {
				stocktakeId,
				userId,
				action: 'NOTED',
				assetId: input.assetId,
				data: { note, needsAttention: input.needsAttention }
			}
		})
	]);
}

/** The caller's own count of a product at a location. Zero is a count: "looked, none here". */
export async function setStocktakeCount(
	userId: string,
	stocktakeId: string,
	input: { productId: string; locationId: string; count: number }
) {
	const stocktake = await loadOpenForWrite(userId, stocktakeId);
	await assertCountingLocation(stocktake.organizationId, input.locationId);
	if (!Number.isInteger(input.count) || input.count < 0) {
		throw new StocktakeError('invalid_request', 'A count is a whole number of zero or more');
	}
	const counted = await prisma.stocktakeLine.count({
		where: { stocktakeId, productId: input.productId }
	});
	if (counted === 0) {
		throw new StocktakeError(
			'stocktake_product_not_counted',
			'This product is not counted in this stocktake'
		);
	}
	const key = {
		stocktakeId,
		productId: input.productId,
		locationId: input.locationId,
		userId
	};
	await prisma.$transaction([
		prisma.stocktakeCount.upsert({
			where: { stocktakeId_productId_locationId_userId: key },
			create: { ...key, count: input.count },
			update: { count: input.count }
		}),
		prisma.stocktakeEvent.create({
			data: {
				stocktakeId,
				userId,
				action: 'COUNTED',
				productId: input.productId,
				locationId: input.locationId,
				data: { count: input.count }
			}
		})
	]);
}

// ---------------------------------------------------------------------------
// Closing

/**
 * Freezes the report. Open items become missing, and each of the org's units
 * on it gets one entry in its history.
 */
export async function closeStocktake(userId: string, stocktakeId: string) {
	const stocktake = await loadOpenForWrite(userId, stocktakeId);
	const items = await prisma.stocktakeItem.findMany({
		where: { stocktakeId, asset: { organizationId: stocktake.organizationId } },
		include: { foundLocation: { select: { id: true, name: true } } }
	});
	await prisma.$transaction(async (tx) => {
		await tx.stocktake.update({
			where: { id: stocktakeId },
			data: { status: 'CLOSED', closedAt: new Date(), closedById: userId }
		});
		await tx.assetTransaction.createMany({
			data: items.map((item) => {
				const state = itemState(item, true);
				return {
					assetId: item.assetId,
					userId,
					action: 'STOCKTAKE_COUNTED',
					data: {
						type: 'STOCKTAKE_COUNTED',
						stocktakeId,
						stocktakeName: stocktake.name,
						result: state === 'unexpected' ? 'found' : state,
						locationId: item.foundLocation?.id ?? null,
						locationName: item.foundLocation?.name ?? null
					}
				};
			})
		});
	});
}

/** An open stocktake started by mistake. It goes without a trace; a closed one stays. */
export async function cancelStocktake(userId: string, stocktakeId: string) {
	await loadOpenForWrite(userId, stocktakeId);
	await prisma.stocktake.delete({ where: { id: stocktakeId } });
}

/**
 * The units each action would change, worked out from the report and the
 * assets as they are *now* — a unit may have moved or been retired since the
 * count. Shown on the report before applying, and exactly what applying does.
 */
export async function actionCandidates(userId: string, stocktakeId: string) {
	const stocktake = await loadForRead(userId, stocktakeId);
	const items = await prisma.stocktakeItem.findMany({
		where: { stocktakeId, asset: { organizationId: stocktake.organizationId } },
		select: {
			assetId: true,
			expected: true,
			foundAt: true,
			outProductionId: true,
			foundLocationId: true,
			needsAttention: true,
			asset: {
				select: {
					status: true,
					locationId: true,
					parentAssetId: true,
					productionItems: { where: { status: 'CHECKED_OUT' }, select: { id: true } }
				}
			}
		}
	});
	const live = items.filter((i) => !isRetiredStatus(i.asset.status));
	return {
		// Missing, and not out on a job now either — it may have left after the snapshot.
		mark_missing_unavailable: live
			.filter(
				(i) =>
					itemState(i, true) === 'missing' &&
					i.asset.status !== 'UNAVAILABLE' &&
					i.asset.productionItems.length === 0
			)
			.map((i) => i.assetId),
		restore_found_available: live
			.filter((i) => i.foundAt && i.asset.status === 'UNAVAILABLE')
			.map((i) => i.assetId),
		// An accessory lives wherever its parent does; moving the parent moves it.
		move_found: live
			.filter(
				(i) =>
					i.foundAt &&
					i.foundLocationId &&
					i.foundLocationId !== i.asset.locationId &&
					!i.asset.parentAssetId
			)
			.map((i) => i.assetId),
		flag_maintenance: live
			.filter((i) => i.foundAt && i.needsAttention && i.asset.status !== 'MAINTENANCE')
			.map((i) => i.assetId),
		flag_broken: live
			.filter((i) => i.foundAt && i.needsAttention && i.asset.status !== 'BROKEN')
			.map((i) => i.assetId)
	} satisfies Record<StocktakeAction, string[]>;
}

async function setStatus(userId: string, assetIds: string[], to: AssetStatus) {
	const assets = await prisma.asset.findMany({
		where: { id: { in: assetIds } },
		select: { id: true, status: true }
	});
	await prisma.$transaction([
		prisma.asset.updateMany({ where: { id: { in: assetIds } }, data: { status: to } }),
		prisma.assetTransaction.createMany({
			data: assets.map((a) => ({
				assetId: a.id,
				userId,
				action: 'UPDATED',
				data: { type: 'UPDATED', changes: [{ field: 'status', from: a.status, to }] }
			}))
		})
	]);
}

/**
 * Applies one of the report's corrections. The flag actions are two ways of
 * answering the same question, so applying either uses up both.
 */
export async function applyStocktakeAction(
	userId: string,
	stocktakeId: string,
	action: StocktakeAction
) {
	const stocktake = await loadForWrite(userId, stocktakeId);
	if (stocktake.status !== 'CLOSED') {
		throw new StocktakeError('stocktake_not_closed', 'Close the stocktake first');
	}
	const spent =
		action === 'flag_maintenance' || action === 'flag_broken'
			? ['flag_maintenance', 'flag_broken']
			: [action];
	if (spent.some((a) => stocktake.appliedActions.includes(a))) {
		throw new StocktakeError('stocktake_action_applied', 'This action has already been applied');
	}

	const assetIds = (await actionCandidates(userId, stocktakeId))[action];
	const affected = new Set(assetIds);

	switch (action) {
		case 'mark_missing_unavailable':
			await setStatus(userId, assetIds, 'UNAVAILABLE');
			break;
		case 'restore_found_available':
			await setStatus(userId, assetIds, 'AVAILABLE');
			break;
		case 'flag_maintenance':
			await setStatus(userId, assetIds, 'MAINTENANCE');
			break;
		case 'flag_broken':
			await setStatus(userId, assetIds, 'BROKEN');
			break;
		case 'move_found': {
			const items = await prisma.stocktakeItem.findMany({
				where: { stocktakeId, assetId: { in: assetIds } },
				select: {
					assetId: true,
					foundLocation: { select: { id: true, name: true } },
					asset: { select: { accessories: { where: ACTIVE_ASSET_WHERE, select: { id: true } } } }
				}
			});
			await prisma.$transaction(async (tx) => {
				for (const item of items) {
					const location = item.foundLocation!;
					const moved = [item.assetId, ...item.asset.accessories.map((a) => a.id)];
					moved.forEach((id) => affected.add(id));
					await tx.asset.update({ where: { id: item.assetId }, data: { locationId: location.id } });
					await syncAccessories(tx, item.assetId, { locationId: location.id });
					await tx.assetTransaction.createMany({
						data: moved.map((assetId) => ({
							assetId,
							userId,
							action: 'LOCATION_ASSIGNED',
							data: {
								type: 'LOCATION_ASSIGNED',
								locationId: location.id,
								locationName: location.name
							}
						}))
					});
				}
			});
			break;
		}
	}

	await prisma.stocktake.update({
		where: { id: stocktakeId },
		data: { appliedActions: { push: spent } }
	});
	return {
		changed: assetIds.length,
		assetIds: [...affected],
		organizationId: stocktake.organizationId
	};
}

// ---------------------------------------------------------------------------
// Export

function csvCell(value: string | number | null | undefined) {
	const s = value === null || value === undefined ? '' : String(value);
	return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * One row per unit and one per product count, semicolon-separated — what a
 * German Excel opens without an import dialog. Column names are English and
 * stable, like the state values: this is data, not a page.
 */
export function stocktakeCsv(detail: StocktakeDetail) {
	const closed = detail.status === 'CLOSED';
	const header = [
		'state',
		'assetTag',
		'serialNumber',
		'manufacturer',
		'product',
		'category',
		'expectedLocation',
		'foundLocation',
		'foundBy',
		'foundAt',
		'outAt',
		'unexpectedReason',
		'needsAttention',
		'note',
		'expectedCount',
		'countedCount'
	];
	const rows: (string | number | null)[][] = detail.items.map((i) => [
		itemState(i, closed),
		i.asset.assetTag,
		i.asset.serialNumber,
		i.asset.product.manufacturer?.name ?? null,
		i.asset.product.name,
		i.asset.product.category.name,
		i.expectedLocation?.name ?? null,
		i.foundLocation?.name ?? null,
		i.foundBy ? i.foundBy.name || i.foundBy.email : null,
		i.foundAt?.toISOString() ?? null,
		i.outProductionName,
		i.unexpectedReason,
		i.needsAttention ? 'yes' : '',
		i.note,
		null,
		null
	]);
	for (const p of productCounts(detail, '')) {
		for (const at of p.locations) {
			rows.push([
				'count',
				null,
				null,
				p.product.manufacturer?.name ?? null,
				p.product.name,
				p.product.category.name,
				at.location.name,
				at.location.name,
				at.counters.map((c) => `${c.name} (${c.count})`).join(', '),
				null,
				at.out > 0 ? String(at.out) : null,
				null,
				'',
				null,
				at.expected,
				at.counted
			]);
		}
	}
	return [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n') + '\r\n';
}
