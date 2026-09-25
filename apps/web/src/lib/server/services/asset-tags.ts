import { prisma } from '$lib/server/auth';
import type { Prisma } from '$lib/prisma/client';
import { isRetiredStatus } from '$lib/asset-status';
import { isSystemAdmin, managedOrgIds } from './access';
import { CABLE_ENDS } from './cable-ends';

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
	return tag;
}

/** One new unit of a product, carrying the tag that was just scanned. */
export async function registerTaggedUnit(
	userId: string,
	input: { productId: string; organizationId: string; locationId: string; assetTag: string }
) {
	await assertInventory(userId, input.organizationId);
	const [product, location, org] = await Promise.all([
		prisma.product.findUnique({
			where: { id: input.productId },
			select: { id: true, isLicense: true }
		}),
		prisma.location.findUnique({
			where: { id: input.locationId },
			select: { organizationId: true }
		}),
		prisma.organization.findUniqueOrThrow({
			where: { id: input.organizationId },
			select: { defaultInspectionIntervalMonths: true }
		})
	]);
	if (!product) throw new AssetTagError('not_found', 'Product not found');
	if (location?.organizationId !== input.organizationId) {
		throw new AssetTagError('location_invalid', 'The location is not one of this org');
	}
	const assetTag = await checkTag(input.organizationId, input.assetTag);

	// The same snapshot the web takes on creation: the org's interval as of
	// today, and none for a license, which has no wiring to test.
	const interval = product.isLicense ? null : org.defaultInspectionIntervalMonths;
	const now = new Date();
	return prisma.asset.create({
		data: {
			organizationId: input.organizationId,
			productId: product.id,
			locationId: input.locationId,
			assetTag,
			status: 'AVAILABLE',
			inspectionIntervalMonths: interval,
			nextInspectionDue: interval
				? new Date(now.getFullYear(), now.getMonth() + interval, now.getDate())
				: null,
			transactions: { create: [{ userId, action: 'CREATED', data: { type: 'CREATED' } }] }
		},
		include: API_ASSET_INCLUDE
	});
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
