import { prisma } from '#lib/server/auth.js';
import type { Prisma } from '#lib/prisma/client.js';
import { isRetiredStatus } from '#lib/asset-status.js';
import { isSystemAdmin, managedOrgIds } from './access';
import { CABLE_ENDS } from './cable-ends';
import { canPlaceAt } from './locations';
import { kitHoldingTag } from './asset-lookup';
import { createUnitsInTx, kitForNewUnits } from './asset-create';

// Registering units and giving untagged ones their sticker, from the scanner.
// Both are inventory work, so both take ADMIN of the org — the rule the web's
// `requireOrgInventory` applies to the same actions. Nothing here numbers a
// tag: a tag is what is printed on the unit, and the scan is how it arrives.

/** What `toAsset` maps, so a caller can answer with the unit it just changed. */
export const API_ASSET_INCLUDE = {
	product: { include: { manufacturer: true, category: true, ...CABLE_ENDS } },
	location: { include: { address: true, organization: true } },
	organization: true
} satisfies Prisma.AssetInclude;

export class AssetTagError extends Error {
	constructor(
		readonly code:
			| 'forbidden'
			| 'not_found'
			| 'location_invalid'
			| 'asset_tag_in_use'
			| 'asset_tag_prefix_mismatch'
			| 'asset_already_tagged'
			| 'asset_retired',
		message: string
	) {
		super(message);
		this.name = 'AssetTagError';
	}
}

export const ASSET_TAG_ERROR_STATUS: Record<AssetTagError['code'], number> = {
	forbidden: 403,
	not_found: 404,
	location_invalid: 400,
	asset_tag_in_use: 409,
	asset_tag_prefix_mismatch: 409,
	asset_already_tagged: 409,
	asset_retired: 409
};

async function assertInventory(userId: string, organizationId: string) {
	if (await isSystemAdmin(userId)) return;
	if (!(await managedOrgIds(userId)).includes(organizationId)) {
		throw new AssetTagError('forbidden', 'Registering and tagging units takes ADMIN of the org');
	}
}

/** The tag, checked against the org's prefix and against every unit that already has one. */
async function checkTag(organizationId: string, raw: string) {
	const tag = raw.trim();
	const { assetIdPrefix: prefix } = await prisma.organization.findUniqueOrThrow({
		where: { id: organizationId },
		select: { assetIdPrefix: true }
	});
	if (!tag.startsWith(prefix)) {
		throw new AssetTagError(
			'asset_tag_prefix_mismatch',
			`Asset tag "${tag}" has to start with the org prefix "${prefix}"`
		);
	}
	const holder = await prisma.asset.findUnique({
		where: { assetTag: tag },
		select: { product: { select: { name: true } } }
	});
	if (holder) {
		throw new AssetTagError(
			'asset_tag_in_use',
			`Asset tag "${tag}" is already on ${holder.product.name}`
		);
	}
	const kit = await kitHoldingTag([tag]);
	if (kit) {
		throw new AssetTagError('asset_tag_in_use', `Asset tag "${tag}" is already on ${kit.name}`);
	}
	return tag;
}

type NewUnitsInput = {
	productId: string;
	organizationId: string;
	locationId: string;
	/** A kit of the same org to create them straight into — see `kitForNewUnits`. */
	bundleId?: string | null;
};

/**
 * Checks what every registration checks — who, which product, which kit,
 * where — and creates the units through `createUnitsInTx`, the web's own path,
 * so a unit from the scanner starts out exactly like one from the web form.
 * `checkTags` runs after the cheap refusals and before anything is written.
 */
async function registerUnits(
	userId: string,
	input: NewUnitsInput,
	count: number,
	checkTags: () => Promise<(string | null)[]>
) {
	await assertInventory(userId, input.organizationId);
	const product = await prisma.product.findUnique({
		where: { id: input.productId },
		select: { id: true }
	});
	if (!product) throw new AssetTagError('not_found', 'Product not found');
	const bundle = input.bundleId
		? await kitForNewUnits({
				bundleId: input.bundleId,
				organizationId: input.organizationId,
				productIds: Array.from({ length: count }, () => product.id)
			})
		: null;
	// The kit's own location wins, as on the web.
	const location = await prisma.location.findUnique({
		where: { id: bundle?.locationId ?? input.locationId },
		select: { id: true, organizationId: true }
	});
	if (!location || !(await canPlaceAt(userId, location, input.organizationId))) {
		throw new AssetTagError('location_invalid', 'The location is not one this org may use');
	}
	const tags = await checkTags();

	const { created } = await prisma.$transaction((tx) =>
		createUnitsInTx(tx, {
			userId,
			organizationId: input.organizationId,
			locationId: location.id,
			units: tags.map((assetTag) => ({
				productId: product.id,
				assetTag,
				noAssetTag: assetTag === null
			})),
			bundleId: bundle?.id ?? null
		})
	);
	const ids = created.map((unit) => unit.id);
	const rows = await prisma.asset.findMany({
		where: { id: { in: ids } },
		include: API_ASSET_INCLUDE
	});
	const byId = new Map(rows.map((row) => [row.id, row]));
	return ids.map((id) => byId.get(id)!);
}

/** One new unit of a product, carrying the tag that was just scanned. */
export async function registerTaggedUnit(
	userId: string,
	input: NewUnitsInput & { assetTag: string }
) {
	const [unit] = await registerUnits(userId, input, 1, async () => [
		await checkTag(input.organizationId, input.assetTag)
	]);
	return unit;
}

/**
 * `count` units of a product that carry no tag — a drawer of cables. No tag
 * is numbered for them even where the org numbers its units: a number nobody
 * printed is on no sticker, and `assignAssetTag` gives one when one is stuck on.
 */
export async function registerUntaggedUnits(userId: string, input: NewUnitsInput, count: number) {
	return registerUnits(userId, input, count, async () => Array.from({ length: count }, () => null));
}

/**
 * Gives an untagged unit the tag that was just scanned. A unit that already
 * has one is refused rather than retagged: from a handheld, a second scan on
 * the wrong row is far likelier than a sticker that really changed, and the
 * web's edit form is where a tag is corrected.
 */
export async function assignAssetTag(userId: string, input: { assetId: string; assetTag: string }) {
	const asset = await prisma.asset.findUnique({
		where: { id: input.assetId },
		select: { id: true, organizationId: true, assetTag: true, status: true }
	});
	if (!asset) throw new AssetTagError('not_found', 'Asset not found');
	await assertInventory(userId, asset.organizationId);
	if (isRetiredStatus(asset.status)) {
		throw new AssetTagError('asset_retired', 'This unit is sold or decommissioned');
	}
	if (asset.assetTag) {
		throw new AssetTagError(
			'asset_already_tagged',
			`This unit already carries "${asset.assetTag}"`
		);
	}
	const assetTag = await checkTag(asset.organizationId, input.assetTag);
	return prisma.asset.update({
		where: { id: asset.id },
		data: {
			assetTag,
			// The same entry the web's edit form writes for a changed tag.
			transactions: {
				create: [
					{
						userId,
						action: 'UPDATED',
						data: { type: 'UPDATED', changes: [{ field: 'assetTag', from: null, to: assetTag }] }
					}
				]
			}
		},
		include: API_ASSET_INCLUDE
	});
}
