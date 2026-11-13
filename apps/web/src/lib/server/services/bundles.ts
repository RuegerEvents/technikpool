import { prisma } from '#lib/server/auth.js';
import { appError } from '#lib/errors.js';
import { BOOKABLE_ASSET_WHERE, isBookableStatus, isRetiredStatus } from '#lib/asset-status.js';
import { ROLE_FOR, roleAtLeast } from '#lib/roles.js';
import { searchMatcher } from '#lib/search.js';
import { naturalCompare } from '#lib/sort.js';
import { isSystemAdmin, orgRole, userOrgIds } from './access';
import { syncAccessories } from './accessories';
import { resolveScannedCode } from './asset-lookup';
import { assertAdditionsFitType, assertNewInstanceMatchesType } from './bundle-spec';
import { bundleImageForRead } from './bundle-image';

// Everything that changes what a kit holds, for the web's remote functions and
// for /api/v1 alike, so the scanner fills a case under exactly the rules the
// bundle page does: one kit per unit, accessories along with their unit, the
// kit's location winning, and what goes in answering to the bundle type. The
// callers decide what to refresh; this file never touches a query.

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** A kit a unit came out of when it moved into another one. */
export type LeftBundle = { id: string; templateId: string };

/** Keeping a kit is ADMIN+ of the org whose kit it is, as on the web. */
export async function requireBundleEditor(userId: string, organizationId: string) {
	if (await isSystemAdmin(userId)) return;
	const role = await orgRole(userId, organizationId);
	if (!role) appError(403, 'not_org_member');
	if (!roleAtLeast(role, ROLE_FOR.inventory)) appError(403, 'unauthorized');
}

/**
 * A bundle's tag is unique across the install, like a unit's — and may not be
 * a unit's tag either, or a scan could not tell the two apart.
 */
export async function assertBundleTagAvailable(tag: string | null, exceptBundleId?: string) {
	if (!tag) return;
	const clash = await prisma.assetBundle.findUnique({ where: { tag }, select: { id: true } });
	if (clash && clash.id !== exceptBundleId) appError(409, 'bundle_tag_taken', [tag]);
	const unit = await prisma.asset.findUnique({
		where: { assetTag: tag },
		select: { product: { select: { name: true } } }
	});
	if (unit) appError(409, 'bundle_tag_on_unit', [tag, unit.product.name]);
}

/**
 * The guards a unit has to pass to join a kit, and the move itself. Returns
 * the kit it came out of, if `moveFromOtherBundles` let it change kits.
 */
export async function moveAssetIntoBundle(
	tx: Tx,
	userId: string,
	bundle: { id: string; locationId: string | null },
	assetId: string,
	moveFromOtherBundles = false
): Promise<LeftBundle | null> {
	const asset = await tx.asset.findUniqueOrThrow({
		where: { id: assetId },
		select: {
			status: true,
			bundleId: true,
			parentAssetId: true,
			bundle: { select: { id: true, templateId: true, template: true } }
		}
	});
	if (isRetiredStatus(asset.status)) appError(409, 'asset_retired_no_bundle');
	if (!isBookableStatus(asset.status)) appError(409, 'asset_unavailable_no_bundle');
	// An accessory is in whatever kit its parent is in and no other.
	if (asset.parentAssetId) appError(409, 'bundle_accessory_member');
	// A unit belongs to one kit at a time. Moving it out of another one takes
	// the user having been shown which — without that flag this is a stale
	// page, and moving it silently would empty a kit nobody was looking at.
	const from = asset.bundle && asset.bundle.id !== bundle.id ? asset.bundle : null;
	if (from) {
		if (!moveFromOtherBundles) appError(409, 'asset_in_other_bundle', [from.template.name]);
		await requireBundleEditor(userId, from.template.organizationId);
	}
	const data: { bundleId: string; locationId?: string } = { bundleId: bundle.id };
	if (bundle.locationId) data.locationId = bundle.locationId;
	await tx.asset.update({ where: { id: assetId }, data });
	// Whatever is attached to it comes along — the kit ships as one thing.
	await syncAccessories(tx, assetId, data);
	return from ? { id: from.id, templateId: from.templateId } : null;
}

function distinctLeft(left: LeftBundle[]) {
	return [...new Map(left.map((b) => [b.id, b])).values()];
}

async function bundleWithTemplate(bundleId: string) {
	return prisma.assetBundle.findUniqueOrThrow({
		where: { id: bundleId },
		include: { template: true }
	});
}

/** Puts units into a kit, all of them or none. */
export async function addUnitsToBundle(
	userId: string,
	bundleId: string,
	assetIds: string[],
	options: { allowTypeChange?: boolean; moveFromOtherBundles?: boolean } = {}
) {
	const bundle = await bundleWithTemplate(bundleId);
	await requireBundleEditor(userId, bundle.template.organizationId);
	const picked = await prisma.asset.findMany({
		where: { id: { in: assetIds } },
		select: { productId: true }
	});
	if (picked.length !== assetIds.length) appError(404, 'assets_not_found');
	await assertAdditionsFitType({
		templateId: bundle.templateId,
		bundleId,
		productIds: picked.map((asset) => asset.productId),
		allowTypeChange: options.allowTypeChange
	});
	const left = await prisma.$transaction(async (tx) => {
		const from: LeftBundle[] = [];
		for (const assetId of assetIds) {
			const out = await moveAssetIntoBundle(
				tx,
				userId,
				bundle,
				assetId,
				options.moveFromOtherBundles
			);
			if (out) from.push(out);
		}
		return from;
	});
	return { bundle, left: distinctLeft(left) };
}

/** Takes a unit out of its kit; its accessories leave with it. */
export async function removeUnitFromBundle(userId: string, bundleId: string, assetId: string) {
	const bundle = await bundleWithTemplate(bundleId);
	await requireBundleEditor(userId, bundle.template.organizationId);
	const asset = await prisma.asset.findUniqueOrThrow({
		where: { id: assetId },
		select: { bundleId: true }
	});
	if (asset.bundleId !== bundleId) appError(404, 'assets_not_found');
	await prisma.$transaction(async (tx) => {
		await tx.asset.update({ where: { id: assetId }, data: { bundleId: null } });
		await syncAccessories(tx, assetId, { bundleId: null });
	});
	return bundle;
}

export type CreateBundleInput = {
	organizationId: string;
	templateId?: string;
	newTemplateName?: string;
	caption?: string;
	details?: string;
	categoryId?: string;
	tag?: string;
	assetIds?: string[];
	moveFromOtherBundles?: boolean;
};

/**
 * A new case: of an existing type, or of a type made with it. A case of a type
 * already on the shelf has to arrive as the kit, so its units are part of the
 * same call.
 */
export async function createBundle(userId: string, data: CreateBundleInput) {
	await requireBundleEditor(userId, data.organizationId);
	if (data.templateId) {
		const existing = await prisma.bundleTemplate.findUniqueOrThrow({
			where: { id: data.templateId },
			select: { organizationId: true }
		});
		if (existing.organizationId !== data.organizationId) appError(403, 'unauthorized');
	}
	const tag = data.tag?.trim() || null;
	await assertBundleTagAvailable(tag);

	let templateId = data.templateId;
	let templateCreated = false;
	if (data.newTemplateName?.trim() && !templateId) {
		if (!data.categoryId) appError(400, 'bundle_category_required');
		await prisma.category.findUniqueOrThrow({ where: { id: data.categoryId } });
		const template = await prisma.bundleTemplate.create({
			data: {
				name: data.newTemplateName.trim(),
				caption: data.caption?.trim() || undefined,
				details: data.details?.trim() || undefined,
				organizationId: data.organizationId,
				categoryId: data.categoryId
			}
		});
		templateId = template.id;
		templateCreated = true;
	}
	if (!templateId) appError(400, 'bundle_type_required');

	const assetIds = data.assetIds ?? [];
	if (assetIds.length > 0 || !templateCreated) {
		const picked = await prisma.asset.findMany({
			where: { id: { in: assetIds } },
			select: { productId: true }
		});
		if (picked.length !== assetIds.length) appError(404, 'assets_not_found');
		await assertNewInstanceMatchesType(
			templateId,
			picked.map((asset) => asset.productId)
		);
	}

	const { left, ...bundle } = await prisma.$transaction(async (tx) => {
		const created = await tx.assetBundle.create({
			data: { templateId, tag: tag ?? undefined },
			include: { template: { include: { organization: true, category: true } }, assets: true }
		});
		const from: LeftBundle[] = [];
		for (const assetId of assetIds) {
			const out = await moveAssetIntoBundle(
				tx,
				userId,
				created,
				assetId,
				data.moveFromOtherBundles
			);
			if (out) from.push(out);
		}
		return { ...created, left: from };
	});
	return { bundle, templateId, left: distinctLeft(left) };
}

// ---------------------------------------------------------------------------
// Scanning into a kit

export type BundleScan =
	| { outcome: 'added'; assetId: string; left: LeftBundle[] }
	| { outcome: 'already_in'; assetId: string }
	| { outcome: 'in_other_bundle'; assetId: string; otherBundle: { id: string; name: string } }
	| { outcome: 'not_found' | 'ambiguous' | 'is_bundle' };

/**
 * A scanned code, put into the kit. An accessory's sticker brings its unit,
 * which is what goes into a kit. A unit in another kit is not moved unless
 * `moveFromOtherBundle` says the user was asked — the answer names the kit so
 * the question can.
 */
export async function scanIntoBundle(
	userId: string,
	bundleId: string,
	code: string,
	moveFromOtherBundle = false
): Promise<BundleScan> {
	const trimmed = code.trim();
	const kit = await prisma.assetBundle.findUnique({
		where: { tag: trimmed },
		select: { id: true }
	});
	if (kit) return { outcome: 'is_bundle' };
	const resolved = await resolveScannedCode(userId, trimmed);
	if (resolved.kind !== 'match') return { outcome: resolved.kind };
	const scanned = await prisma.asset.findUniqueOrThrow({
		where: { id: resolved.assetId },
		select: { id: true, parentAssetId: true }
	});
	const assetId = scanned.parentAssetId ?? scanned.id;
	const asset = await prisma.asset.findUniqueOrThrow({
		where: { id: assetId },
		select: {
			bundleId: true,
			bundle: { select: { id: true, template: { select: { name: true } } } }
		}
	});
	if (asset.bundleId === bundleId) return { outcome: 'already_in', assetId };
	if (asset.bundle && !moveFromOtherBundle) {
		return {
			outcome: 'in_other_bundle',
			assetId,
			otherBundle: { id: asset.bundle.id, name: asset.bundle.template.name }
		};
	}
	const { left } = await addUnitsToBundle(userId, bundleId, [assetId], {
		moveFromOtherBundles: moveFromOtherBundle
	});
	return { outcome: 'added', assetId, left };
}

// ---------------------------------------------------------------------------
// Loose units by name and number

export interface LooseGroup {
	/** Product and shelf: units under one key are interchangeable here. */
	key: string;
	productId: string;
	locationId: string;
	productName: string;
	productCaption: string | null;
	productImagePath: string | null;
	manufacturerName: string | null;
	locationName: string;
	/** Loose, bookable, not out: what can go into the kit. */
	available: number;
	/** Of those, how many carry no tag — the ones a scan cannot reach. */
	untagged: number;
}

/** What a kit can take: the org's own top-level units, in no kit, not out. */
function looseWhere(organizationId: string) {
	return {
		organizationId,
		parentAssetId: null,
		bundleId: null,
		...BOOKABLE_ASSET_WHERE,
		productionItems: { none: { status: 'CHECKED_OUT' } }
	};
}

/**
 * The kit's org's loose units whose product matches `text`, by product and
 * shelf — for the cables nobody tagged, which a scan cannot put in.
 */
export async function searchLooseForBundle(userId: string, bundleId: string, text: string) {
	const bundle = await bundleWithTemplate(bundleId);
	await requireBundleEditor(userId, bundle.template.organizationId);
	if (text.replace(/\s/g, '').length < 2) return [];
	const matchSearch = searchMatcher(text);
	const assets = await prisma.asset.findMany({
		where: looseWhere(bundle.template.organizationId),
		select: {
			assetTag: true,
			productId: true,
			locationId: true,
			location: { select: { name: true } },
			product: {
				select: {
					name: true,
					caption: true,
					imagePath: true,
					cableType: true,
					manufacturer: { select: { name: true } },
					connectorARef: { select: { name: true } },
					connectorBRef: { select: { name: true } }
				}
			}
		}
	});
	const groups = new Map<string, LooseGroup>();
	for (const asset of assets) {
		const p = asset.product;
		if (
			!matchSearch(
				p.name,
				p.caption,
				p.manufacturer?.name,
				p.cableType,
				p.connectorARef?.name,
				p.connectorBRef?.name,
				asset.assetTag
			)
		)
			continue;
		const key = `${asset.productId}|${asset.locationId}`;
		const group = groups.get(key) ?? {
			key,
			productId: asset.productId,
			locationId: asset.locationId,
			productName: p.name,
			productCaption: p.caption,
			productImagePath: p.imagePath,
			manufacturerName: p.manufacturer?.name ?? null,
			locationName: asset.location.name,
			available: 0,
			untagged: 0
		};
		group.available += 1;
		if (!asset.assetTag) group.untagged += 1;
		groups.set(key, group);
	}
	return [...groups.values()]
		.sort(
			(a, b) =>
				naturalCompare(a.productName, b.productName) ||
				naturalCompare(a.locationName, b.locationName)
		)
		.slice(0, 40);
}

/**
 * Puts up to `count` loose units of one product and shelf into the kit,
 * untagged first — those are what this is for — then by unit number.
 */
export async function addLooseToBundle(
	userId: string,
	bundleId: string,
	group: { productId: string; locationId: string },
	count: number
) {
	const bundle = await bundleWithTemplate(bundleId);
	await requireBundleEditor(userId, bundle.template.organizationId);
	const free = await prisma.asset.findMany({
		where: {
			...looseWhere(bundle.template.organizationId),
			productId: group.productId,
			locationId: group.locationId
		},
		select: { id: true, assetTag: true, orgIndex: true }
	});
	const picked = free
		.sort(
			(a, b) => Number(a.assetTag !== null) - Number(b.assetTag !== null) || a.orgIndex - b.orgIndex
		)
		.slice(0, count)
		.map((a) => a.id);
	if (picked.length === 0) return { bundle, count: 0, left: [] as LeftBundle[] };
	const { left } = await addUnitsToBundle(userId, bundleId, picked);
	return { bundle, count: picked.length, left };
}

// ---------------------------------------------------------------------------
// Reading, for /api/v1

const BUNDLE_UNIT_SELECT = {
	id: true,
	assetTag: true,
	serialNumber: true,
	orgIndex: true,
	status: true,
	parentAssetId: true,
	product: {
		select: {
			id: true,
			name: true,
			caption: true,
			imagePath: true,
			manufacturer: { select: { name: true } }
		}
	},
	location: { select: { id: true, name: true } },
	productionItems: {
		where: { status: 'CHECKED_OUT' },
		select: { production: { select: { name: true } } },
		take: 1
	}
} as const;

/** The kits of the user's orgs, or of one of them, matching `text` if given. */
export async function listBundles(userId: string, organizationId?: string, text?: string) {
	const orgIds = await userOrgIds(userId);
	const scope = organizationId ? orgIds.filter((id) => id === organizationId) : orgIds;
	const bundles = await prisma.assetBundle.findMany({
		where: { template: { organizationId: { in: scope } } },
		select: {
			id: true,
			tag: true,
			imagePath: true,
			imageFingerprint: true,
			location: { select: { id: true, name: true } },
			template: {
				select: {
					name: true,
					caption: true,
					organizationId: true,
					category: { select: { name: true, nameDe: true } },
					featuredProducts: { select: { id: true } }
				}
			},
			// Accessories too: the picture is drawn over everything in the case.
			assets: {
				select: {
					assetTag: true,
					parentAssetId: true,
					product: {
						select: {
							id: true,
							imagePath: true,
							name: true,
							manufacturer: { select: { name: true } }
						}
					}
				}
			}
		}
	});
	// The scanner reads kits only through here, so a stale picture is redrawn
	// on its reads as on the web's.
	for (const bundle of bundles) bundleImageForRead(bundle);
	const matchSearch = searchMatcher(text ?? '');
	return bundles
		.filter(
			(b) =>
				matchSearch(b.template.name, b.template.caption, b.tag) ||
				matchSearch(
					b.template.name,
					b.template.caption,
					...b.assets.flatMap((a) => [a.product.name, a.product.manufacturer?.name, a.assetTag])
				)
		)
		.sort((a, b) => naturalCompare(a.template.name, b.template.name))
		.map((b) => ({ ...b, unitCount: b.assets.filter((a) => !a.parentAssetId).length }));
}

/** One kit with its units and their accessories, and whether this user may change it. */
export async function bundleDetail(userId: string, bundleId: string) {
	const bundle = await prisma.assetBundle.findUniqueOrThrow({
		where: { id: bundleId },
		select: {
			id: true,
			tag: true,
			imagePath: true,
			imageFingerprint: true,
			location: { select: { id: true, name: true } },
			template: {
				select: {
					name: true,
					caption: true,
					organizationId: true,
					category: { select: { name: true, nameDe: true } },
					featuredProducts: { select: { id: true } }
				}
			},
			assets: { select: BUNDLE_UNIT_SELECT }
		}
	});
	const orgIds = await userOrgIds(userId);
	const admin = await isSystemAdmin(userId);
	if (!admin && !orgIds.includes(bundle.template.organizationId)) appError(404, 'record_not_found');
	const role = await orgRole(userId, bundle.template.organizationId);
	const canEdit = admin || (!!role && roleAtLeast(role, ROLE_FOR.inventory));
	bundleImageForRead(bundle);
	return { ...bundle, canEdit };
}
