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
// - An open stocktake keeps no list of its own. What it expects is worked out
//   from its scope against the assets *as they are now*, every time it is
//   read: a unit registered or moved into the scope appears on the list, one
//   retired or moved out leaves it, and "checked out" is the status of the
//   moment. A unit is individual when it can be told apart from its siblings
//   — it has a tag, or is an accessory, a bundle member or has accessories —
//   and is otherwise part of a line, a number per product and location.
//   Units checked out right now are accounted for, not missing.
// - Only the counting is stored: a StocktakeItem per ticked unit (with the
//   note on it), a StocktakeCount per counter, product and location. Nothing
//   about an asset changes while a stocktake is open; each counter may only
//   undo their own.
// - Closing freezes it. The list of that moment is written into
//   StocktakeItem/StocktakeLine, open units become missing, and each unit gets
//   one STOCKTAKE_COUNTED entry in the asset history. From then on the stored
//   rows are the report, and it never moves again. The status/location
//   corrections are separate actions on the closed report, each applied at
//   most once.

export type StocktakeScope = {
	locationIds: string[];
	categoryIds: string[];
	productIds: string[];
	/**
	 * Explicit units, set on a recount. When there are any, the individual
	 * units on the list are exactly these and the filters above only add loose
	 * lines; when empty, the filters decide both.
	 */
	assetIds: string[];
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
 * Why a ticked unit is not on the list. Worked out against the scope as the
 * unit is now, so a unit moved into the scope after being scanned stops being
 * unexpected. `out_of_scope` is anything the filter did not ask for (another
 * category, or not among a recount's units).
 */
export type UnexpectedReason = 'other_org' | 'retired' | 'other_location' | 'out_of_scope';

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

/** What every question about a stocktake needs of it. */
type StocktakeHead = {
	id: string;
	organizationId: string;
	status: string;
	scope: Prisma.JsonValue;
};

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
// What a scope expects, right now

export function parseScope(value: unknown): StocktakeScope {
	const v = (value ?? {}) as Partial<Record<keyof StocktakeScope, unknown>>;
	const list = (x: unknown) =>
		Array.isArray(x) ? x.filter((i): i is string => typeof i === 'string') : [];
	return {
		locationIds: list(v.locationIds),
		categoryIds: list(v.categoryIds),
		productIds: list(v.productIds),
		assetIds: list(v.assetIds)
	};
}

type ExpectedItem = {
	assetId: string;
	expectedLocationId: string;
	outProductionId: string | null;
	outProductionName: string | null;
};

type ExpectedLine = { productId: string; locationId: string; expected: number; out: number };

/** The list a scope resolves to: individual units, and a number per product and location. */
type Expected = { items: ExpectedItem[]; lines: ExpectedLine[] };

/**
 * Turns a set of units into the expected rows. Accessories come along with
 * the units they hang off regardless of the filter — they live wherever their
 * parent is, and a case filed under "Cases" is still part of the fixture.
 */
async function unitsOf(userId: string, where: Prisma.AssetWhereInput): Promise<Expected> {
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

	const items: ExpectedItem[] = [];
	const lines = new Map<string, ExpectedLine>();
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

function filterWhere(organizationId: string, scope: StocktakeScope): Prisma.AssetWhereInput {
	return {
		organizationId,
		parentAssetId: null,
		...(scope.locationIds.length > 0 ? { locationId: { in: scope.locationIds } } : {}),
		...(scope.productIds.length > 0 ? { productId: { in: scope.productIds } } : {}),
		...(scope.categoryIds.length > 0 ? { product: { categoryId: { in: scope.categoryIds } } } : {})
	};
}

/**
 * What a scope expects at this moment. `among` narrows the answer to those
 * units — what a scan needs — keeping their parents in, so an accessory of a
 * unit in the scope still comes along.
 */
async function resolveScope(
	userId: string,
	organizationId: string,
	scope: StocktakeScope,
	among?: string[]
): Promise<Expected> {
	const narrow: Prisma.AssetWhereInput = among
		? { OR: [{ id: { in: among } }, { accessories: { some: { id: { in: among } } } }] }
		: {};
	if (scope.assetIds.length === 0) {
		return await unitsOf(userId, { ...filterWhere(organizationId, scope), ...narrow });
	}
	const listed = new Set(scope.assetIds);
	const byId = await unitsOf(userId, {
		organizationId,
		id: { in: among ? scope.assetIds.filter((id) => among.includes(id)) : scope.assetIds }
	});
	const loose =
		scope.productIds.length > 0 || scope.categoryIds.length > 0
			? await unitsOf(userId, { ...filterWhere(organizationId, scope), ...narrow })
			: { items: [], lines: [] };
	return {
		// A listed parent pulls its accessories in, but they are not listed
		// themselves: they were found last time, or are missing and listed too.
		items: byId.items.filter((i) => listed.has(i.assetId)),
		lines: loose.lines
	};
}

function unexpectedReasonFor(
	organizationId: string,
	scope: StocktakeScope,
	asset: { organizationId: string; status: string; locationId: string }
): UnexpectedReason {
	if (asset.organizationId !== organizationId) return 'other_org';
	if (isRetiredStatus(asset.status)) return 'retired';
	if (scope.locationIds.length > 0 && !scope.locationIds.includes(asset.locationId)) {
		return 'other_location';
	}
	return 'out_of_scope';
}

type TickedRow = {
	assetId: string;
	asset: { organizationId: string; status: string; locationId: string };
};

/**
 * Lays the stored ticks over what the scope expects right now: a ticked unit
 * on the list is found (with today's location and checkout), one off the list
 * is unexpected, and whatever is on the list and not ticked is still open.
 */
function overlay<T extends TickedRow>(
	organizationId: string,
	scope: StocktakeScope,
	expected: Expected,
	ticked: T[]
) {
	const byAsset = new Map(expected.items.map((i) => [i.assetId, i]));
	const rows = ticked.map((t) => {
		const e = byAsset.get(t.assetId);
		return {
			...t,
			expected: !!e,
			expectedLocationId: e?.expectedLocationId ?? null,
			outProductionId: e?.outProductionId ?? null,
			outProductionName: e?.outProductionName ?? null,
			unexpectedReason: e ? null : unexpectedReasonFor(organizationId, scope, t.asset)
		};
	});
	const tickedIds = new Set(ticked.map((t) => t.assetId));
	return { rows, open: expected.items.filter((i) => !tickedIds.has(i.assetId)) };
}

/** The open stocktakes of an org that expect units or counted products this list does. */
async function overlapsWith(
	userId: string,
	organizationId: string,
	expected: Expected,
	excludeId?: string
) {
	const open = await prisma.stocktake.findMany({
		where: { organizationId, status: 'OPEN', ...(excludeId ? { id: { not: excludeId } } : {}) },
		select: { id: true, name: true, scope: true }
	});
	if (open.length === 0) return [];

	const units = new Set(expected.items.map((i) => i.assetId));
	const lineKeys = new Set(expected.lines.map((l) => `${l.productId}|${l.locationId}`));
	const overlaps: { id: string; name: string; sharedUnits: number }[] = [];
	for (const s of open) {
		const theirs = await resolveScope(userId, organizationId, parseScope(s.scope));
		const sharedUnits =
			theirs.items.filter((i) => units.has(i.assetId)).length +
			theirs.lines
				.filter((l) => lineKeys.has(`${l.productId}|${l.locationId}`))
				.reduce((n, l) => n + l.expected, 0);
		if (sharedUnits > 0) overlaps.push({ id: s.id, name: s.name, sharedUnits });
	}
	return overlaps;
}

function expectedTotals(expected: Expected) {
	return {
		units: expected.items.filter((i) => !i.outProductionId).length,
		looseUnits: expected.lines.reduce((n, l) => n + l.expected, 0),
		out:
			expected.items.filter((i) => i.outProductionId).length +
			expected.lines.reduce((n, l) => n + l.out, 0)
	};
}

/** What a caller may narrow a stocktake to. Explicit units are a recount's to set. */
export type StocktakeFilter = Omit<StocktakeScope, 'assetIds'>;

export async function previewStocktake(
	userId: string,
	input: { organizationId: string; scope: StocktakeFilter }
) {
	if (!(await canWrite(userId, input.organizationId))) {
		throw new StocktakeError(
			'forbidden',
			'Only members of this organization can start a stocktake'
		);
	}
	const expected = await resolveScope(userId, input.organizationId, {
		...input.scope,
		assetIds: []
	});
	return {
		...expectedTotals(expected),
		overlaps: await overlapsWith(userId, input.organizationId, expected)
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

/** Starts one. Only the header is stored; the list is the scope, resolved whenever it is read. */
async function persist(
	userId: string,
	data: {
		organizationId: string;
		name: string;
		scope: StocktakeScope;
		recountOfId?: string;
	}
) {
	const expected = await resolveScope(userId, data.organizationId, data.scope);
	if (expected.items.length === 0 && expected.lines.length === 0) {
		throw new StocktakeError('stocktake_empty', 'Nothing matches this selection');
	}
	return await prisma.stocktake.create({
		data: {
			organizationId: data.organizationId,
			name: data.name,
			scope: data.scope,
			recountOfId: data.recountOfId,
			createdById: userId
		}
	});
}

export async function createStocktake(
	userId: string,
	input: { organizationId: string; name?: string | null; scope: StocktakeFilter }
) {
	if (!(await canWrite(userId, input.organizationId))) {
		throw new StocktakeError(
			'forbidden',
			'Only members of this organization can start a stocktake'
		);
	}
	// Scope ids from another org would only ever match nothing, but they would
	// also be shown back as the stocktake's filter.
	const scope: StocktakeScope = { ...input.scope, assetIds: [] };
	const [locations, categories, products] = await Promise.all([
		prisma.location.count({
			where: { id: { in: scope.locationIds }, organizationId: input.organizationId }
		}),
		prisma.category.count({ where: { id: { in: scope.categoryIds } } }),
		prisma.product.count({ where: { id: { in: scope.productIds } } })
	]);
	if (
		locations !== scope.locationIds.length ||
		categories !== scope.categoryIds.length ||
		products !== scope.productIds.length
	) {
		throw new StocktakeError(
			'invalid_request',
			'Unknown location, category or product in the scope'
		);
	}

	const name = input.name?.trim() || (await defaultName(input.organizationId, scope, 'Inventur'));
	return await persist(userId, { organizationId: input.organizationId, name, scope });
}

/**
 * A new stocktake of a closed one's gaps: its missing units, and every
 * product whose count came up short, recounted from scratch — loose units
 * have no identity to recount one by one. Both are resolved live like any
 * scope, so a missing unit moved since the count is expected where it is now.
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

	const originalScope = parseScope(original.scope);
	const date = new Date().toLocaleDateString('de-DE', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric'
	});
	return await persist(userId, {
		organizationId: original.organizationId,
		name: name?.trim() || `${original.name} – Nachzählung ${date}`,
		scope: {
			locationIds: originalScope.locationIds,
			categoryIds: [],
			productIds: [...shortProducts],
			assetIds: missing.map((m) => m.assetId)
		},
		recountOfId: original.id
	});
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

const LINE_INCLUDE = {
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
} satisfies Prisma.StocktakeLineInclude;

/**
 * One unit on the list. On an open stocktake most of these are not stored
 * anywhere — they are the scope, resolved — so there is no row id to carry.
 */
export type StocktakeItemRow = Omit<
	Prisma.StocktakeItemGetPayload<{ include: typeof ITEM_INCLUDE }>,
	'id' | 'stocktakeId'
>;

export type StocktakeLineRow = Omit<
	Prisma.StocktakeLineGetPayload<{ include: typeof LINE_INCLUDE }>,
	'id' | 'stocktakeId'
>;

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
	// A found unit that is out still counts as found, not as out.
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

/**
 * The list as it stands: the stored rows of a closed stocktake, or the scope
 * resolved now with the ticks laid over it. `among` narrows it to those units.
 */
async function itemRows(
	userId: string,
	stocktake: StocktakeHead,
	among?: string[]
): Promise<StocktakeItemRow[]> {
	const narrow = among ? { assetId: { in: among } } : {};
	if (stocktake.status !== 'OPEN') {
		return await prisma.stocktakeItem.findMany({
			where: { stocktakeId: stocktake.id, ...narrow },
			include: ITEM_INCLUDE
		});
	}
	const scope = parseScope(stocktake.scope);
	const [expected, ticked] = await Promise.all([
		resolveScope(userId, stocktake.organizationId, scope, among),
		prisma.stocktakeItem.findMany({
			where: { stocktakeId: stocktake.id, foundAt: { not: null }, ...narrow },
			include: ITEM_INCLUDE
		})
	]);
	const { rows, open } = overlay(stocktake.organizationId, scope, expected, ticked);
	const [assets, locations] = await Promise.all([
		prisma.asset.findMany({
			where: { id: { in: open.map((i) => i.assetId) } },
			select: ITEM_INCLUDE.asset.select
		}),
		prisma.location.findMany({
			where: { organizationId: stocktake.organizationId },
			select: { id: true, name: true }
		})
	]);
	const assetOf = new Map(assets.map((a) => [a.id, a]));
	const locationOf = new Map(locations.map((l) => [l.id, l]));
	return [
		...rows.map((r) => ({
			...r,
			expectedLocation: r.expectedLocationId ? (locationOf.get(r.expectedLocationId) ?? null) : null
		})),
		...open.flatMap((i) => {
			const asset = assetOf.get(i.assetId);
			if (!asset) return [];
			return [
				{
					assetId: i.assetId,
					asset,
					expected: true,
					expectedLocationId: i.expectedLocationId,
					expectedLocation: locationOf.get(i.expectedLocationId) ?? null,
					outProductionId: i.outProductionId,
					outProductionName: i.outProductionName,
					unexpectedReason: null,
					foundAt: null,
					foundById: null,
					foundBy: null,
					foundLocationId: null,
					foundLocation: null,
					foundVia: null,
					note: null,
					needsAttention: false
				}
			];
		})
	];
}

/** The loose lines: stored once closed, the scope's while open. */
async function lineRows(userId: string, stocktake: StocktakeHead): Promise<StocktakeLineRow[]> {
	if (stocktake.status !== 'OPEN') {
		return await prisma.stocktakeLine.findMany({
			where: { stocktakeId: stocktake.id },
			include: LINE_INCLUDE
		});
	}
	const { lines } = await resolveScope(
		userId,
		stocktake.organizationId,
		parseScope(stocktake.scope)
	);
	const [products, locations] = await Promise.all([
		prisma.product.findMany({
			where: { id: { in: [...new Set(lines.map((l) => l.productId))] } },
			select: LINE_INCLUDE.product.select
		}),
		prisma.location.findMany({
			where: { id: { in: [...new Set(lines.map((l) => l.locationId))] } },
			select: LINE_INCLUDE.location.select
		})
	]);
	const productOf = new Map(products.map((p) => [p.id, p]));
	const locationOf = new Map(locations.map((l) => [l.id, l]));
	return lines.flatMap((l) => {
		const product = productOf.get(l.productId);
		const location = locationOf.get(l.locationId);
		return product && location ? [{ ...l, product, location }] : [];
	});
}

/** A stocktake's progress: from its stored rows once closed, from the live list while open. */
async function progressOfStocktake(
	userId: string,
	s: StocktakeHead & {
		items: (TickedRow & {
			expected: boolean;
			foundAt: Date | null;
			outProductionId: string | null;
		})[];
		lines: { productId: string; expected: number; out: number }[];
		counts: { productId: string; count: number }[];
	}
) {
	if (s.status !== 'OPEN') return progressOf(s.items, s.lines, s.counts);
	const scope = parseScope(s.scope);
	const expected = await resolveScope(userId, s.organizationId, scope);
	const { rows, open } = overlay(
		s.organizationId,
		scope,
		expected,
		s.items.filter((i) => i.foundAt)
	);
	return progressOf(
		[
			...rows,
			...open.map((i) => ({ expected: true, foundAt: null, outProductionId: i.outProductionId }))
		],
		expected.lines,
		s.counts
	);
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
			items: {
				select: {
					assetId: true,
					expected: true,
					foundAt: true,
					outProductionId: true,
					asset: { select: { organizationId: true, status: true, locationId: true } }
				}
			},
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
	const summaries = [];
	for (const s of stocktakes) {
		const progress = await progressOfStocktake(userId, s);
		// eslint-disable-next-line @typescript-eslint/no-unused-vars -- the rows are the progress
		const { items, lines, counts, ...rest } = s;
		const scope = parseScope(s.scope);
		summaries.push({
			...rest,
			scope,
			countingLocations: countingLocationsOf(s.organizationId, scope, locations),
			progress
		});
	}
	return summaries;
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
			counts: {
				include: {
					location: { select: { id: true, name: true } },
					user: { select: { id: true, name: true, email: true } }
				}
			}
		}
	});
	const scope = parseScope(stocktake.scope);
	const [items, lines, locations, categories, products] = await Promise.all([
		itemRows(userId, stocktake),
		lineRows(userId, stocktake),
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
		items,
		lines,
		progress: progressOf(items, lines, stocktake.counts)
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

/**
 * Tick units as found. Already found ones are left alone — whoever found a
 * unit first owns that tick — and a unit not on the list comes in as
 * unexpected. Returns what happened to each id.
 */
async function tick(
	userId: string,
	stocktake: StocktakeHead,
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
	const scope = parseScope(stocktake.scope);
	const [newAssets, expected] = await Promise.all([
		prisma.asset.findMany({
			where: { id: { in: newIds } },
			select: { id: true, organizationId: true, status: true, locationId: true }
		}),
		newIds.length > 0
			? resolveScope(userId, stocktake.organizationId, scope, newIds)
			: Promise.resolve<Expected>({ items: [], lines: [] })
	]);
	const expectedIds = new Set(expected.items.map((i) => i.assetId));

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
				// Whether it is on the list is read live as long as the stocktake
				// is open; this is the answer of the moment, and closing rewrites it.
				const onList = expectedIds.has(assetId);
				await tx.stocktakeItem.create({
					data: {
						stocktakeId: stocktake.id,
						assetId,
						expected: onList,
						unexpectedReason: onList
							? null
							: unexpectedReasonFor(stocktake.organizationId, scope, asset),
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
			/** The unit is checked out to this production right now, and is here after all. */
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

	const { already } = await tick(userId, stocktake, [match.assetId], input.locationId, 'scan');
	const item = (await itemRows(userId, stocktake, [match.assetId])).find(
		(i) => i.assetId === match.assetId
	);
	if (!item) throw new StocktakeError('asset_not_found', `Tag "${code}" not found`, code);
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
 * Takes back one's own tick. The row goes with it: a unit is only ever stored
 * because someone ticked it, and the list knows it from the scope.
 */
export async function untickStocktakeItem(userId: string, stocktakeId: string, assetId: string) {
	await loadOpenForWrite(userId, stocktakeId);
	const item = await ownFoundItem(userId, stocktakeId, assetId);
	await prisma.$transaction([
		prisma.stocktakeItem.delete({ where: { id: item.id } }),
		prisma.stocktakeEvent.create({
			data: { stocktakeId, userId, action: 'UNFOUND', assetId, locationId: item.foundLocationId }
		})
	]);
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
	const { lines } = await resolveScope(
		userId,
		stocktake.organizationId,
		parseScope(stocktake.scope)
	);
	if (!lines.some((l) => l.productId === input.productId)) {
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
 * Freezes the report: the list of this moment is written down, open units
 * become missing, and each of the org's units on it gets one entry in its
 * history.
 */
export async function closeStocktake(userId: string, stocktakeId: string) {
	const stocktake = await loadOpenForWrite(userId, stocktakeId);
	const scope = parseScope(stocktake.scope);
	const [expected, ticked] = await Promise.all([
		resolveScope(userId, stocktake.organizationId, scope),
		prisma.stocktakeItem.findMany({
			where: { stocktakeId, foundAt: { not: null } },
			select: {
				id: true,
				assetId: true,
				foundAt: true,
				foundLocation: { select: { id: true, name: true } },
				asset: { select: { organizationId: true, status: true, locationId: true } }
			}
		})
	]);
	const { rows, open } = overlay(stocktake.organizationId, scope, expected, ticked);
	const closedAt = new Date();

	await prisma.$transaction(async (tx) => {
		// Whatever an older version stored at the start makes way for the list
		// of now; the ticks are the only rows that carry anything of their own.
		await tx.stocktakeItem.deleteMany({ where: { stocktakeId, foundAt: null } });
		await tx.stocktakeLine.deleteMany({ where: { stocktakeId } });
		for (const r of rows) {
			await tx.stocktakeItem.update({
				where: { id: r.id },
				data: {
					expected: r.expected,
					expectedLocationId: r.expectedLocationId,
					outProductionId: r.outProductionId,
					outProductionName: r.outProductionName,
					unexpectedReason: r.unexpectedReason
				}
			});
		}
		await tx.stocktakeItem.createMany({
			data: open.map((i) => ({ ...i, stocktakeId, expected: true }))
		});
		await tx.stocktakeLine.createMany({
			data: expected.lines.map((l) => ({ ...l, stocktakeId }))
		});
		await tx.stocktake.update({
			where: { id: stocktakeId },
			data: { status: 'CLOSED', closedAt, closedById: userId }
		});

		const entry = (
			assetId: string,
			state: ItemState,
			location: { id: string; name: string } | null
		) => ({
			assetId,
			userId,
			action: 'STOCKTAKE_COUNTED',
			data: {
				type: 'STOCKTAKE_COUNTED',
				stocktakeId,
				stocktakeName: stocktake.name,
				result: state === 'unexpected' ? 'found' : state,
				locationId: location?.id ?? null,
				locationName: location?.name ?? null
			}
		});
		await tx.assetTransaction.createMany({
			data: [
				...rows
					.filter((r) => r.asset.organizationId === stocktake.organizationId)
					.map((r) => entry(r.assetId, itemState(r, true), r.foundLocation)),
				...open.map((i) =>
					entry(i.assetId, itemState({ ...i, expected: true, foundAt: null }, true), null)
				)
			]
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
		// Missing, and not out on a job now either — it may have left since the count.
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
