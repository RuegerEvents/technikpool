import { prisma } from '#lib/server/auth.js';
import { ACTIVE_ASSET_WHERE } from '#lib/asset-status.js';
import { countProducts, specShortfall } from '#lib/bundle-spec.js';
import { bundleLabel, makerAndName, withCaption } from '#lib/product-label.js';
import { naturalCompare } from '#lib/sort.js';
import { userLabel } from '#lib/user-label.svelte.js';
import {
	isSystemAdmin,
	productionVisibility,
	userOrgIds,
	visibleProductionName,
	writableOrgIds
} from './access';
import { bundleByCode, bundleCaseOf, kitByTag, resolveScannedCode } from './asset-lookup';
import { bundleNumber } from '#lib/bundle-case.js';
import { bundleTypeSpec } from './bundle-spec';
import type { CaseCheckedData } from '#lib/types/asset-transaction.js';
import { caseLabelLines, type CaseLabelData } from '#lib/server/case-label-zpl.js';
import { kitAssetsWhere } from '#lib/bundle-nesting.js';
import { applySwap, loadSwapRows, swapCheck, type SwapNotice } from './unit-swap';

// Checking a case (Kiste checken): open one kit, or one unit with its
// accessories, and tick off what is in it. A stocktake for one box — but
// nothing is stored while it runs. The ticking happens on the client, which
// holds the whole list, so a scan inside the box costs no round trip; the
// server is asked twice, for the list and for the result.
//
// The result goes into the history of every unit in the case, one
// CASE_CHECKED entry each, like STOCKTAKE_COUNTED. Missing units are only
// reported: marking them unavailable stays with the stocktake or the unit's
// own page, because an empty slot in a case is more often "lent to the next
// case" than "lost".
//
// Framework-agnostic like the rest of this directory: the remote functions and
// /api/v1 each turn a CaseCheckError into their own error shape.

export type CaseKind = 'bundle' | 'asset';
export type CaseRef = { kind: CaseKind; id: string };

export class CaseCheckError extends Error {
	constructor(
		readonly code: 'asset_not_found' | 'serial_ambiguous' | 'not_a_case' | 'forbidden',
		message: string,
		readonly param?: string
	) {
		super(message);
	}
}

export const CASE_CHECK_ERROR_STATUS: Record<CaseCheckError['code'], number> = {
	asset_not_found: 404,
	serial_ambiguous: 409,
	not_a_case: 409,
	forbidden: 403
};

export type CaseCheckItem = {
	assetId: string;
	assetTag: string | null;
	serialNumber: string | null;
	orgIndex: number;
	name: string;
	caption: string | null;
	/** The product's photo, as a stored key — see $lib/images. */
	imagePath: string | null;
	/** The unit in this case it is an accessory of, or null for a unit of its own. */
	accessoryOf: string | null;
	/**
	 * The production it is out on when that is not where the rest of the case
	 * is — a unit taken out of its kit for another job. Not finding it is then
	 * no surprise, and it is reported as away rather than missing.
	 */
	awayOn: string | null;
	/**
	 * The kit inside the case this unit is in — the adapter set in the FOH
	 * case. The check lists it expanded, under the inner kit's name; the label
	 * prints the inner kit as one line.
	 */
	innerKit: { id: string; name: string; tag: string | null } | null;
};

export type CaseCheck = CaseRef & {
	/** The bundle's own tag — scanning it again inside the check means nothing. */
	tag: string | null;
	name: string;
	organizationId: string;
	/** Where the case as a whole is checked out to right now, if anywhere. */
	checkedOutTo: string | null;
	items: CaseCheckItem[];
	/**
	 * What the case is short of compared with other cases of its type — a unit
	 * that was taken out of the kit for good, which no tick can reveal because
	 * it is no longer on the list. Kits only; empty while the type has one case.
	 */
	shortOfType: { name: string; missing: number }[];
	lastCheck: {
		at: Date;
		userName: string;
		found: number;
		expected: number;
	} | null;
	/** MEMBER+ of the owning org. Anyone who sees the equipment may check; saving writes history. */
	canRecord: boolean;
};

export type CaseCheckResult = { found: number; missing: number; away: number };

/**
 * Which case a scanned code opens.
 *
 * A bundle tag is its kit. A unit opens the kit it is in before anything else,
 * since that is the box in hand — including a unit with accessories of its
 * own, which the kit check covers anyway. An accessory opens its unit, and a
 * unit with accessories opens itself. Anything else is not a case.
 */
export async function findCase(
	userId: string,
	code: string
): Promise<{ ref: CaseRef; scannedAssetId: string | null }> {
	const trimmed = code.trim();
	// The kit's own tag, or its case's: the case in hand is the kit.
	const bundle = await bundleByCode(trimmed);
	if (bundle) return { ref: { kind: 'bundle', id: bundle.bundleId }, scannedAssetId: null };

	const match = await resolveScannedCode(userId, trimmed);
	if (match.kind === 'ambiguous') {
		throw new CaseCheckError(
			'serial_ambiguous',
			`Serial number "${trimmed}" is ambiguous`,
			trimmed
		);
	}
	if (match.kind === 'not_found') {
		throw new CaseCheckError('asset_not_found', `Tag "${trimmed}" not found`, trimmed);
	}

	const asset = await prisma.asset.findUniqueOrThrow({
		where: { id: match.assetId },
		select: {
			id: true,
			bundleId: true,
			parentAssetId: true,
			product: { select: { name: true, manufacturer: { select: { name: true } } } },
			_count: { select: { accessories: { where: ACTIVE_ASSET_WHERE } } }
		}
	});
	const scannedAssetId = asset.id;
	if (asset.bundleId) return { ref: { kind: 'bundle', id: asset.bundleId }, scannedAssetId };
	if (asset.parentAssetId) {
		return { ref: { kind: 'asset', id: asset.parentAssetId }, scannedAssetId };
	}
	if (asset._count.accessories > 0) return { ref: { kind: 'asset', id: asset.id }, scannedAssetId };

	const label = makerAndName(asset.product.manufacturer?.name, asset.product.name);
	throw new CaseCheckError('not_a_case', `${label} is neither a kit nor has accessories`, label);
}

const ITEM_SELECT = {
	id: true,
	assetTag: true,
	serialNumber: true,
	orgIndex: true,
	parentAssetId: true,
	productId: true,
	organizationId: true,
	bundleId: true,
	bundle: { select: { id: true, tag: true, template: { select: { name: true, caption: true } } } },
	product: {
		select: {
			name: true,
			caption: true,
			imagePath: true,
			manufacturer: { select: { name: true } }
		}
	},
	productionItems: {
		where: { status: 'CHECKED_OUT' },
		select: {
			production: {
				select: {
					id: true,
					name: true,
					organizationId: true,
					organization: { select: { name: true, shortName: true } }
				}
			}
		},
		take: 1
	}
} as const;

/** The case's head and its units, or null when it no longer exists or is not one. */
async function loadCaseRows(ref: CaseRef) {
	if (ref.kind === 'bundle') {
		const bundle = await prisma.assetBundle.findUnique({
			where: { id: ref.id },
			select: {
				id: true,
				tag: true,
				templateId: true,
				template: { select: { name: true, caption: true, organizationId: true } },
				childBundles: { select: { templateId: true } }
			}
		});
		if (!bundle) return null;
		// The kits inside come along, expanded: opening the case means opening them.
		const rows = await prisma.asset.findMany({
			where: { ...kitAssetsWhere(bundle.id), ...ACTIVE_ASSET_WHERE },
			select: ITEM_SELECT
		});
		// Its number: its own tag, else its case's (#lib/bundle-case.ts), which
		// the label prints as its code.
		const number = bundleNumber(bundle, await bundleCaseOf(bundle.id));
		return {
			ref,
			tag: number.code,
			name: bundleLabel({ ...bundle, tag: number.code }),
			title: bundle.template.name,
			caption: bundle.template.caption,
			code: number.code,
			organizationId: bundle.template.organizationId,
			templateId: bundle.templateId,
			innerKits: bundle.childBundles,
			rows
		};
	}

	const root = await prisma.asset.findUnique({
		where: { id: ref.id },
		select: {
			...ITEM_SELECT,
			accessories: { where: ACTIVE_ASSET_WHERE, select: ITEM_SELECT }
		}
	});
	if (!root || root.accessories.length === 0) return null;
	const { accessories, ...head } = root;
	const label = makerAndName(head.product.manufacturer?.name, head.product.name);
	return {
		ref,
		tag: null,
		name: head.assetTag ? `${label} (${head.assetTag})` : label,
		title: label,
		caption: head.product.caption,
		code: head.assetTag,
		organizationId: head.organizationId,
		templateId: null,
		innerKits: [],
		rows: [head, ...accessories]
	};
}

async function canSeeEquipment(userId: string, organizationId: string) {
	if (await isSystemAdmin(userId)) return true;
	return (await userOrgIds(userId)).includes(organizationId);
}

async function canWrite(userId: string, organizationId: string) {
	if (await isSystemAdmin(userId)) return true;
	return (await writableOrgIds(userId)).includes(organizationId);
}

async function readCase(userId: string, ref: CaseRef) {
	const loaded = await loadCaseRows(ref);
	if (!loaded) throw new CaseCheckError('not_a_case', 'Not a case', ref.id);
	if (!(await canSeeEquipment(userId, loaded.organizationId))) {
		throw new CaseCheckError('forbidden', 'No access to this case');
	}

	// Where the case is: whatever most of its units share, home counting as a
	// place of its own. So one unit pulled for another job is away from a case
	// on the shelf, and the whole case at a show is not away from itself.
	const productionOf = (row: (typeof loaded.rows)[number]) =>
		row.productionItems[0]?.production ?? null;
	const tally = new Map<string | null, number>();
	for (const row of loaded.rows) {
		const id = productionOf(row)?.id ?? null;
		tally.set(id, (tally.get(id) ?? 0) + 1);
	}
	const caseProductionId = [...tally].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
	const canSee = await productionVisibility(userId);
	const nameOf = (production: NonNullable<ReturnType<typeof productionOf>>) =>
		visibleProductionName(production, canSee);

	const inCase = new Set(loaded.rows.map((r) => r.id));
	const items: CaseCheckItem[] = loaded.rows.map((row) => {
		const production = productionOf(row);
		return {
			assetId: row.id,
			assetTag: row.assetTag,
			serialNumber: row.serialNumber,
			orgIndex: row.orgIndex,
			name: makerAndName(row.product.manufacturer?.name, row.product.name),
			caption: row.product.caption,
			imagePath: row.product.imagePath,
			accessoryOf: row.parentAssetId && inCase.has(row.parentAssetId) ? row.parentAssetId : null,
			awayOn: production && production.id !== caseProductionId ? nameOf(production) : null,
			innerKit:
				ref.kind === 'bundle' && row.bundle && row.bundleId !== ref.id
					? {
							id: row.bundle.id,
							name: withCaption(row.bundle.template.name, row.bundle.template.caption),
							tag: row.bundle.tag
						}
					: null
		};
	});

	const caseProduction = loaded.rows.map(productionOf).find((p) => p?.id === caseProductionId);
	return {
		loaded,
		items: ordered(items),
		checkedOutTo: caseProduction ? nameOf(caseProduction) : null,
		rows: loaded.rows
	};
}

/**
 * Units by name, each followed by its own accessories — the order they sit in
 * the box. The case's own units first, then each kit inside it with its units.
 */
function ordered(items: CaseCheckItem[]) {
	const byName = (a: CaseCheckItem, b: CaseCheckItem) =>
		naturalCompare(a.name, b.name) || a.orgIndex - b.orgIndex;
	const byKit = (a: CaseCheckItem, b: CaseCheckItem) =>
		Number(a.innerKit !== null) - Number(b.innerKit !== null) ||
		naturalCompare(a.innerKit?.name ?? '', b.innerKit?.name ?? '') ||
		naturalCompare(a.innerKit?.tag ?? '', b.innerKit?.tag ?? '') ||
		naturalCompare(a.innerKit?.id ?? '', b.innerKit?.id ?? '');
	const tops = items.filter((i) => !i.accessoryOf).sort((a, b) => byKit(a, b) || byName(a, b));
	return tops.flatMap((top) => [
		top,
		...items.filter((i) => i.accessoryOf === top.assetId).sort(byName)
	]);
}

export async function getCaseCheck(userId: string, ref: CaseRef): Promise<CaseCheck> {
	const { loaded, items, checkedOutTo, rows } = await readCase(userId, ref);

	// Measured on the case's own units and its inner kits by type: what is in
	// an inner kit is that kit's type's business.
	const shortOfType = loaded.templateId
		? await typeShortfall(
				loaded.templateId,
				rows.filter((r) => !r.parentAssetId && r.bundleId === ref.id),
				loaded.innerKits
			)
		: [];

	const last = await prisma.assetTransaction.findFirst({
		where: {
			assetId: { in: rows.map((r) => r.id) },
			action: 'CASE_CHECKED',
			data: { path: ['caseId'], equals: ref.id }
		},
		orderBy: { createdAt: 'desc' },
		select: { createdAt: true, data: true, user: { select: { name: true, email: true } } }
	});
	const lastData = last?.data as CaseCheckedData | undefined;

	return {
		...ref,
		tag: loaded.tag,
		name: loaded.name,
		organizationId: loaded.organizationId,
		checkedOutTo,
		items,
		shortOfType,
		lastCheck:
			last && lastData
				? {
						at: last.createdAt,
						userName: userLabel(last.user),
						found: lastData.found,
						expected: lastData.expected
					}
				: null,
		canRecord: await canWrite(userId, loaded.organizationId)
	};
}

async function typeShortfall(
	templateId: string,
	members: { productId: string }[],
	innerKits: { templateId: string }[]
) {
	const spec = await bundleTypeSpec(templateId);
	return specShortfall(spec.lines, countProducts(members, innerKits))
		.filter(({ missing }) => missing > 0)
		.map(({ line, missing }) => ({
			name: makerAndName(line.manufacturerName, line.name),
			missing
		}));
}

/**
 * Writes the outcome into every unit's history. The list is read again rather
 * than taken from the client, so a unit that joined or left the case while the
 * check ran is judged by what the case holds now; ids that are not in it are
 * ignored.
 */
export async function recordCaseCheck(
	userId: string,
	ref: CaseRef,
	foundAssetIds: string[]
): Promise<CaseCheckResult> {
	const { loaded, items } = await readCase(userId, ref);
	if (!(await canWrite(userId, loaded.organizationId))) {
		throw new CaseCheckError('forbidden', 'Saving a case check needs MEMBER or above');
	}

	const found = new Set(foundAssetIds);
	const resultOf = (item: CaseCheckItem): CaseCheckedData['result'] =>
		found.has(item.assetId) ? 'found' : item.awayOn ? 'away' : 'missing';
	const results = items.map((item) => ({ item, result: resultOf(item) }));
	const summary: CaseCheckResult = {
		found: results.filter((r) => r.result === 'found').length,
		missing: results.filter((r) => r.result === 'missing').length,
		away: results.filter((r) => r.result === 'away').length
	};

	await prisma.assetTransaction.createMany({
		data: results.map(({ item, result }) => {
			const data: CaseCheckedData = {
				type: 'CASE_CHECKED',
				caseKind: ref.kind,
				caseId: ref.id,
				caseName: loaded.name,
				result,
				found: summary.found,
				expected: items.length
			};
			return { assetId: item.assetId, userId, action: 'CASE_CHECKED', data };
		})
	});
	return summary;
}

/**
 * A code scanned inside a case, when the client does not have it on its list.
 *
 * A unit of the same product and org as one the case still lacks takes that
 * one's place: they swap (see services/unit-swap.ts), the result says so, and
 * the case comes back as it is now, the scanned unit in it. That is the only
 * thing a check changes, and only for whoever may record one. Anything else is
 * `foreign`, named if it can be. `foundAssetIds` are the ticks so far, which no
 * swap takes away.
 */
export async function scanIntoCase(
	userId: string,
	ref: CaseRef,
	code: string,
	foundAssetIds: string[]
): Promise<CaseScanOutcome> {
	const trimmed = code.trim();
	const { loaded, items } = await readCase(userId, ref);
	const match = trimmed ? await resolveScannedCode(userId, trimmed) : null;
	if (match?.kind === 'match') {
		const assetId = match.assetId;
		if (items.some((i) => i.assetId === assetId)) return { outcome: 'found', assetId };
		if (await canWrite(userId, loaded.organizationId)) {
			const swapped = await swapIntoCase(userId, ref, assetId, items, new Set(foundAssetIds));
			if (swapped) {
				return {
					outcome: 'swapped',
					assetId,
					swap: swapped,
					check: await getCaseCheck(userId, ref)
				};
			}
		}
	}
	return { outcome: 'foreign', name: await describeCode(userId, trimmed) };
}

export type CaseScanOutcome =
	| { outcome: 'found'; assetId: string }
	| { outcome: 'swapped'; assetId: string; swap: SwapNotice; check: CaseCheck }
	| { outcome: 'foreign'; name: string | null };

/**
 * The swap itself: the first unit the case still lacks — not ticked, not out
 * on another job, not the unit a unit-case is about — that the scanned one may
 * take the place of. Null when there is none.
 */
async function swapIntoCase(
	userId: string,
	ref: CaseRef,
	assetId: string,
	items: CaseCheckItem[],
	found: Set<string>
): Promise<SwapNotice | null> {
	const open = items.filter(
		(i) => !found.has(i.assetId) && !i.awayOn && !(ref.kind === 'asset' && i.assetId === ref.id)
	);
	if (open.length === 0) return null;
	const rows = new Map(
		(await loadSwapRows([assetId, ...open.map((i) => i.assetId)])).map((r) => [r.id, r])
	);
	const scanned = rows.get(assetId);
	if (!scanned) return null;
	const partners = open
		.map((i) => rows.get(i.assetId))
		.filter((r) => r !== undefined && r.productId === scanned.productId)
		.sort((a, b) => a!.orgIndex - b!.orgIndex);
	for (const partner of partners) {
		if (!partner || (await swapCheck(scanned, partner))) continue;
		return prisma.$transaction((tx) =>
			applySwap(tx, userId, scanned, partner, { kind: 'case_check' })
		);
	}
	return null;
}

/** What a code outside the case is, for "not in this case" — its name, or null if unknown. */
export async function describeCode(userId: string, code: string): Promise<string | null> {
	const trimmed = code.trim();
	const bundle = await kitByTag(trimmed);
	if (bundle) return bundleLabel(bundle);

	const match = await resolveScannedCode(userId, trimmed);
	if (match.kind !== 'match') return null;
	const asset = await prisma.asset.findUniqueOrThrow({
		where: { id: match.assetId },
		select: {
			organizationId: true,
			product: { select: { name: true, manufacturer: { select: { name: true } } } }
		}
	});
	if (!(await canSeeEquipment(userId, asset.organizationId))) return null;
	return makerAndName(asset.product.manufacturer?.name, asset.product.name);
}

/**
 * What a case's label shows: its name, its code, whose it is, and what is in
 * it (see `caseLabelLines`). Anyone
 * who sees the equipment may print one, as anyone may check the case.
 */
export async function caseLabelData(
	userId: string,
	ref: CaseRef
): Promise<CaseLabelData & { logoPath: string | null }> {
	const { loaded, items } = await readCase(userId, ref);
	const org = await prisma.organization.findUniqueOrThrow({
		where: { id: loaded.organizationId },
		select: { name: true, shortName: true, logoPath: true }
	});

	return {
		title: loaded.title,
		caption: loaded.caption,
		code: loaded.code,
		orgName: org.shortName ?? org.name,
		logoPath: org.logoPath,
		lines: caseLabelLines(items)
	};
}
