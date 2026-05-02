import { query, command, getRequestEvent } from '$app/server';
import { prisma } from '$lib/server/auth';
import * as v from 'valibot';
import { getAsset, getAssets } from './assets.remote';
import { getProduction } from './productions.remote';

async function requireAuth() {
	const event = await getRequestEvent();
	if (!event?.locals.user) throw new Error('Unauthorized');
	return event.locals.user;
}

async function userOrgIds(userId: string) {
	const memberships = await prisma.orgMembership.findMany({
		where: { userId },
		select: { organizationId: true }
	});
	return memberships.map((m) => m.organizationId);
}

async function isSystemAdmin(userId: string) {
	const user = await prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } });
	return user?.isAdmin ?? false;
}

export const getAllProductions = query(async () => {
	const user = await requireAuth();
	const memberships = await prisma.orgMembership.findMany({
		where: { userId: user.id },
		select: { organizationId: true }
	});
	const orgIds = memberships.map((m) => m.organizationId);
	return await prisma.production.findMany({
		where: { organizationId: { in: orgIds } },
		include: { organization: { select: { name: true } } },
		orderBy: [{ startDate: 'desc' }, { name: 'asc' }]
	});
});

const scanAssetSchema = v.object({
	assetTag: v.string(),
	targetType: v.picklist(['location', 'production']),
	targetId: v.string()
});

export const scanAsset = command(scanAssetSchema, async (input) => {
	const user = await requireAuth();

	const asset = await prisma.asset.findFirst({
		where: { assetTag: input.assetTag },
		include: {
			product: { include: { manufacturer: true } },
			location: true
		}
	});

	if (!asset) throw new Error(`Tag "${input.assetTag}" not found`);

	const orgIds = await userOrgIds(user.id);
	const systemAdmin = await isSystemAdmin(user.id);
	if (!systemAdmin && !orgIds.includes(asset.organizationId)) {
		throw new Error('No access to this asset');
	}

	if (input.targetType === 'location') {
		const location = await prisma.location.findUniqueOrThrow({ where: { id: input.targetId } });
		if (!systemAdmin && location.organizationId !== asset.organizationId) {
			throw new Error('Location belongs to a different organisation');
		}

		// Auto-return any CHECKED_OUT production items for this asset
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
					userId: user.id,
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
						userId: user.id,
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

		for (const item of checkedOutItems) {
			getProduction(item.production.id).refresh();
		}
		getAsset(asset.id).refresh();
		getAssets(asset.organizationId).refresh();

		return {
			asset: {
				id: asset.id,
				assetTag: asset.assetTag,
				productName: asset.product.name,
				manufacturerName: asset.product.manufacturer.name
			},
			action: 'LOCATION_ASSIGNED' as const,
			targetName: location.name,
			returnedFrom: checkedOutItems.map((i) => i.production.name)
		};
	} else {
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
				userId: user.id,
				productionId: input.targetId,
				action: 'CHECKED_OUT',
				data: { type: 'CHECKED_OUT', productionId: production.id, productionName: production.name }
			}
		});

		getProduction(input.targetId).refresh();

		return {
			asset: {
				id: asset.id,
				assetTag: asset.assetTag,
				productName: asset.product.name,
				manufacturerName: asset.product.manufacturer.name
			},
			action: 'CHECKED_OUT' as const,
			targetName: production.name,
			returnedFrom: [] as string[]
		};
	}
});

const checkoutAssetsSchema = v.object({
	assetIds: v.array(v.string()),
	targetType: v.picklist(['location', 'production']),
	targetId: v.string()
});

export const checkoutAssets = command(checkoutAssetsSchema, async (input) => {
	const user = await requireAuth();
	const orgIds = await userOrgIds(user.id);
	const systemAdmin = await isSystemAdmin(user.id);

	const assets = await prisma.asset.findMany({
		where: { id: { in: input.assetIds } },
		select: { id: true, organizationId: true }
	});

	for (const asset of assets) {
		if (!systemAdmin && !orgIds.includes(asset.organizationId)) {
			throw new Error('No access to one or more assets');
		}
	}

	if (input.targetType === 'location') {
		const location = await prisma.location.findUniqueOrThrow({ where: { id: input.targetId } });

		for (const asset of assets) {
			if (!systemAdmin && location.organizationId !== asset.organizationId) {
				throw new Error('Location belongs to a different organisation');
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
						userId: user.id,
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
							userId: user.id,
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

			for (const item of checkedOutItems) {
				getProduction(item.production.id).refresh();
			}
			getAsset(asset.id).refresh();
			getAssets(asset.organizationId).refresh();
		}

		return { count: assets.length, targetName: location.name };
	} else {
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
					userId: user.id,
					productionId: input.targetId,
					action: 'CHECKED_OUT',
					data: {
						type: 'CHECKED_OUT',
						productionId: production.id,
						productionName: production.name
					}
				}
			});

			getAsset(asset.id).refresh();
			getAssets(asset.organizationId).refresh();
		}

		getProduction(input.targetId).refresh();

		return { count: assets.length, targetName: production.name };
	}
});
