import { prisma } from '$lib/server/auth';
import { isSystemAdmin, userOrgIds } from './access';

// Scan/checkout behaviour lives here rather than in checkout.remote.ts so the
// /api/v1 endpoints and the web UI share one implementation. These functions
// deliberately know nothing about SvelteKit: they take a user id, touch the
// database, and report which records changed. Cache invalidation is the
// caller's job — see `affected` — because query().refresh() only means
// something to the remote-function layer.

export type ScanTargetType = 'location' | 'production';

export interface ScanInput {
	assetTag: string;
	targetType: ScanTargetType;
	targetId: string;
}

export interface ScannedAsset {
	id: string;
	assetTag: string;
	productName: string;
	manufacturerName: string;
}

export interface ScanResult {
	asset: ScannedAsset;
	action: 'LOCATION_ASSIGNED' | 'CHECKED_OUT';
	targetName: string;
	/** Names of productions the asset was automatically returned from. */
	returnedFrom: string[];
}

/** Records touched by an operation, so callers can invalidate their own caches. */
export interface AffectedRecords {
	assetIds: string[];
	organizationIds: string[];
	bundleIds: string[];
	productionIds: string[];
}

function emptyAffected(): AffectedRecords {
	return { assetIds: [], organizationIds: [], bundleIds: [], productionIds: [] };
}

function mergeAffected(into: AffectedRecords, from: Partial<AffectedRecords>) {
	for (const key of Object.keys(into) as (keyof AffectedRecords)[]) {
		for (const id of from[key] ?? []) {
			if (!into[key].includes(id)) into[key].push(id);
		}
	}
	return into;
}

/**
 * Thrown for conditions the API maps onto specific HTTP status codes. Plain
 * Errors elsewhere in this module stay 500s, which is what we want for genuine
 * faults.
 */
export class CheckoutError extends Error {
	constructor(
		readonly code: 'asset_not_found' | 'forbidden' | 'wrong_organization',
		message: string
	) {
		super(message);
		this.name = 'CheckoutError';
	}
}

async function assertAssetAccess(userId: string, organizationId: string) {
	const [orgIds, systemAdmin] = await Promise.all([userOrgIds(userId), isSystemAdmin(userId)]);
	if (!systemAdmin && !orgIds.includes(organizationId)) {
		throw new CheckoutError('forbidden', 'No access to this asset');
	}
	return systemAdmin;
}

/**
 * Move one scanned asset to a location, or check it out to a production.
 *
 * Assigning an asset to a location also returns it from any production it is
 * currently checked out to — putting kit back on the shelf is what "returned"
 * means in practice, and expecting a second explicit action was a reliable way
 * to leave stale CHECKED_OUT rows behind.
 */
export async function performScan(
	userId: string,
	input: ScanInput
): Promise<{ result: ScanResult; affected: AffectedRecords }> {
	const asset = await prisma.asset.findFirst({
		where: { assetTag: input.assetTag },
		include: {
			product: { include: { manufacturer: true } },
			location: true
		}
	});

	if (!asset) {
		throw new CheckoutError('asset_not_found', `Tag "${input.assetTag}" not found`);
	}

	const systemAdmin = await assertAssetAccess(userId, asset.organizationId);

	const scannedAsset: ScannedAsset = {
		id: asset.id,
		assetTag: asset.assetTag ?? input.assetTag,
		productName: asset.product.name,
		manufacturerName: asset.product.manufacturer.name
	};

	const affected = emptyAffected();
	mergeAffected(affected, { assetIds: [asset.id], organizationIds: [asset.organizationId] });

	if (input.targetType === 'location') {
		const location = await prisma.location.findUniqueOrThrow({ where: { id: input.targetId } });
		if (!systemAdmin && location.organizationId !== asset.organizationId) {
			throw new CheckoutError('wrong_organization', 'Location belongs to a different organisation');
		}

		const checkedOutItems = await prisma.productionItem.findMany({
			where: { assetId: asset.id, status: 'CHECKED_OUT' },
			include: { production: { select: { id: true, name: true } } }
		});

		await prisma.$transaction(async (tx) => {
			await tx.asset.update({
				where: { id: asset.id },
				data: { locationId: input.targetId }
			});

			await tx.assetTransaction.create({
				data: {
					assetId: asset.id,
					userId,
					action: 'LOCATION_ASSIGNED',
					data: { type: 'LOCATION_ASSIGNED', locationId: location.id, locationName: location.name }
				}
			});

			for (const item of checkedOutItems) {
				await tx.productionItem.update({
					where: { id: item.id },
					data: { status: 'RETURNED' }
				});
				await tx.assetTransaction.create({
					data: {
						assetId: asset.id,
						userId,
						productionId: item.production.id,
						action: 'RETURNED',
						data: {
							type: 'RETURNED',
							fromProductionId: item.production.id,
							fromProductionName: item.production.name,
							toLocationId: location.id,
							toLocationName: location.name
						}
					}
				});
			}

			// A bundle's location follows the assets inside it.
			if (asset.bundleId) {
				await tx.assetBundle.update({
					where: { id: asset.bundleId },
					data: { locationId: input.targetId }
				});
			}
		});

		mergeAffected(affected, {
			bundleIds: asset.bundleId ? [asset.bundleId] : [],
			productionIds: checkedOutItems.map((i) => i.production.id)
		});

		return {
			result: {
				asset: scannedAsset,
				action: 'LOCATION_ASSIGNED',
				targetName: location.name,
				returnedFrom: checkedOutItems.map((i) => i.production.name)
			},
			affected
		};
	}

	const production = await prisma.production.findUniqueOrThrow({ where: { id: input.targetId } });

	const existingItem = await prisma.productionItem.findFirst({
		where: { productionId: input.targetId, assetId: asset.id }
	});

	if (existingItem) {
		await prisma.productionItem.update({
			where: { id: existingItem.id },
			data: { status: 'CHECKED_OUT' }
		});
	} else {
		await prisma.productionItem.create({
			data: { productionId: input.targetId, assetId: asset.id, status: 'CHECKED_OUT' }
		});
	}

	await prisma.assetTransaction.create({
		data: {
			assetId: asset.id,
			userId,
			productionId: input.targetId,
			action: 'CHECKED_OUT',
			data: { type: 'CHECKED_OUT', productionId: production.id, productionName: production.name }
		}
	});

	mergeAffected(affected, { productionIds: [production.id] });

	return {
		result: {
			asset: scannedAsset,
			action: 'CHECKED_OUT',
			targetName: production.name,
			returnedFrom: []
		},
		affected
	};
}

export interface BulkCheckoutInput {
	assetIds: string[];
	targetType: ScanTargetType;
	targetId: string;
}

/** Move a hand-picked set of assets in one go (the web UI's bulk action). */
export async function performBulkCheckout(
	userId: string,
	input: BulkCheckoutInput
): Promise<{ result: { count: number; targetName: string }; affected: AffectedRecords }> {
	const [orgIds, systemAdmin] = await Promise.all([userOrgIds(userId), isSystemAdmin(userId)]);

	const assets = await prisma.asset.findMany({
		where: { id: { in: input.assetIds } },
		select: { id: true, organizationId: true, bundleId: true }
	});

	for (const asset of assets) {
		if (!systemAdmin && !orgIds.includes(asset.organizationId)) {
			throw new CheckoutError('forbidden', 'No access to one or more assets');
		}
	}

	const affected = emptyAffected();
	mergeAffected(affected, {
		assetIds: assets.map((a) => a.id),
		organizationIds: assets.map((a) => a.organizationId)
	});

	if (input.targetType === 'location') {
		const location = await prisma.location.findUniqueOrThrow({ where: { id: input.targetId } });

		// Only move a bundle's location when the whole bundle is in this batch —
		// a half-moved bundle isn't anywhere in particular.
		const bundleIds = [...new Set(assets.map((a) => a.bundleId).filter(Boolean))] as string[];
		const movedBundleIds: string[] = [];
		for (const bundleId of bundleIds) {
			const bundleAssets = await prisma.asset.findMany({
				where: { bundleId },
				select: { id: true }
			});
			if (bundleAssets.every((ba) => input.assetIds.includes(ba.id))) movedBundleIds.push(bundleId);
		}

		for (const asset of assets) {
			if (!systemAdmin && location.organizationId !== asset.organizationId) {
				throw new CheckoutError(
					'wrong_organization',
					'Location belongs to a different organisation'
				);
			}

			const checkedOutItems = await prisma.productionItem.findMany({
				where: { assetId: asset.id, status: 'CHECKED_OUT' },
				include: { production: { select: { id: true, name: true } } }
			});

			await prisma.$transaction(async (tx) => {
				await tx.asset.update({ where: { id: asset.id }, data: { locationId: input.targetId } });
				await tx.assetTransaction.create({
					data: {
						assetId: asset.id,
						userId,
						action: 'LOCATION_ASSIGNED',
						data: {
							type: 'LOCATION_ASSIGNED',
							locationId: location.id,
							locationName: location.name
						}
					}
				});
				for (const item of checkedOutItems) {
					await tx.productionItem.update({ where: { id: item.id }, data: { status: 'RETURNED' } });
					await tx.assetTransaction.create({
						data: {
							assetId: asset.id,
							userId,
							productionId: item.production.id,
							action: 'RETURNED',
							data: {
								type: 'RETURNED',
								fromProductionId: item.production.id,
								fromProductionName: item.production.name,
								toLocationId: location.id,
								toLocationName: location.name
							}
						}
					});
				}
			});

			mergeAffected(affected, { productionIds: checkedOutItems.map((i) => i.production.id) });
		}

		if (movedBundleIds.length > 0) {
			await prisma.assetBundle.updateMany({
				where: { id: { in: movedBundleIds } },
				data: { locationId: input.targetId }
			});
			mergeAffected(affected, { bundleIds: movedBundleIds });
		}

		return { result: { count: assets.length, targetName: location.name }, affected };
	}

	const production = await prisma.production.findUniqueOrThrow({ where: { id: input.targetId } });

	for (const asset of assets) {
		const existing = await prisma.productionItem.findFirst({
			where: { productionId: input.targetId, assetId: asset.id }
		});

		if (existing) {
			await prisma.productionItem.update({
				where: { id: existing.id },
				data: { status: 'CHECKED_OUT' }
			});
		} else {
			await prisma.productionItem.create({
				data: { productionId: input.targetId, assetId: asset.id, status: 'CHECKED_OUT' }
			});
		}

		await prisma.assetTransaction.create({
			data: {
				assetId: asset.id,
				userId,
				productionId: input.targetId,
				action: 'CHECKED_OUT',
				data: {
					type: 'CHECKED_OUT',
					productionId: production.id,
					productionName: production.name
				}
			}
		});
	}

	mergeAffected(affected, { productionIds: [production.id] });

	return { result: { count: assets.length, targetName: production.name }, affected };
}
