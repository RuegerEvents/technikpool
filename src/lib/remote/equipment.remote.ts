import { query, command, getRequestEvent } from '$app/server';
import { prisma } from '$lib/server/auth';
import * as v from 'valibot';
import { getProduction } from './productions.remote';

async function requireAuth() {
	const event = await getRequestEvent();
	if (!event?.locals.user) {
		throw new Error('Unauthorized');
	}
	return event.locals.user;
}

async function userOrgIds(userId: string) {
	const memberships = await prisma.orgMembership.findMany({
		where: { userId },
		select: { organizationId: true }
	});
	return memberships.map((m) => m.organizationId);
}

const ACTIVE_STATUSES = ['PENDING', 'APPROVED', 'CHECKED_OUT', 'RETURNED'] as const;
const CONFLICT_STATUSES = ['PENDING', 'APPROVED', 'CHECKED_OUT'] as const;

// Full-page equipment editor (categories | available | booked) — replaces the
// per-Asset add/remove flow with per-Product-x-org-x-location quantities.
export const getEquipmentEditorData = query(v.string(), async (productionId: string) => {
	const user = await requireAuth();
	const orgIds = await userOrgIds(user.id);

	const production = await prisma.production.findUniqueOrThrow({
		where: { id: productionId },
		select: { id: true, name: true, startDate: true, endDate: true, organizationId: true }
	});

	const assets = await prisma.asset.findMany({
		where: { organizationId: { in: orgIds } },
		include: {
			product: { include: { manufacturer: true, category: true } },
			organization: { select: { id: true, name: true, color: true, avatarLabel: true } },
			location: { select: { id: true, name: true, address: { select: { city: true } } } },
			productionItems: {
				where: {
					status: { in: [...ACTIVE_STATUSES] },
					OR: [
						{ productionId },
						production.startDate && production.endDate
							? {
									status: { in: [...CONFLICT_STATUSES] },
									production: {
										startDate: { not: null, lte: production.endDate },
										endDate: { not: null, gte: production.startDate }
									}
								}
							: { id: '__never__' }
					]
				}
			}
		}
	});

	type GroupKey = string;
	type Group = {
		key: GroupKey;
		productId: string;
		productName: string;
		manufacturerName: string;
		categoryId: string;
		categoryName: string;
		categoryColor: string;
		categorySortOrder: number;
		organizationId: string;
		organizationName: string;
		organizationColor: string;
		organizationAvatarLabel: string;
		locationId: string;
		locationName: string;
		city: string;
		total: number;
		bookedHere: number;
		unavailableElsewhere: number;
		// Available (not booked here, not conflicting elsewhere) assets that
		// belong to a bundle — hidden from the individual-add flow by default.
		bundledAvailable: number;
		// Of bookedHere, how many were added as part of a bundle — the booked
		// panel shows those under their bundle instead of the product row.
		bookedFromBundle: number;
	};
	const groups = new Map<GroupKey, Group>();
	const assetStatus = new Map<string, { bookedHere: boolean; unavailableElsewhere: boolean }>();

	for (const a of assets) {
		const key = `${a.productId}:${a.organizationId}:${a.locationId}`;
		if (!groups.has(key)) {
			groups.set(key, {
				key,
				productId: a.productId,
				productName: a.product.name,
				manufacturerName: a.product.manufacturer.name,
				categoryId: a.product.categoryId,
				categoryName: a.product.category.name,
				categoryColor: a.product.category.color,
				categorySortOrder: a.product.category.sortOrder,
				organizationId: a.organizationId,
				organizationName: a.organization.name,
				organizationColor: a.organization.color,
				organizationAvatarLabel: a.organization.avatarLabel,
				locationId: a.locationId,
				locationName: a.location.name,
				city: a.location.address.city,
				total: 0,
				bookedHere: 0,
				unavailableElsewhere: 0,
				bundledAvailable: 0,
				bookedFromBundle: 0
			});
		}
		const g = groups.get(key)!;
		g.total++;
		const bookedItem = a.productionItems.find((pi) => pi.productionId === productionId);
		const bookedHere = !!bookedItem;
		const unavailableElsewhere = !bookedHere && a.productionItems.length > 0;
		assetStatus.set(a.id, { bookedHere, unavailableElsewhere });
		if (bookedHere) {
			g.bookedHere++;
			if (bookedItem.sourceBundleId) g.bookedFromBundle++;
		} else if (unavailableElsewhere) g.unavailableElsewhere++;
		else if (a.bundleId) g.bundledAvailable++;
	}

	const assetBundles = await prisma.assetBundle.findMany({
		where: { template: { organizationId: { in: orgIds } } },
		include: {
			template: {
				include: {
					category: { select: { id: true, name: true, color: true, sortOrder: true } },
					organization: { select: { id: true, name: true, color: true, avatarLabel: true } }
				}
			},
			location: { select: { id: true, name: true, address: { select: { city: true } } } },
			assets: {
				include: { product: { include: { manufacturer: true } } }
			}
		}
	});

	const bundles = assetBundles
		.map((b) => {
			let bookedHere = 0;
			let availableCount = 0;
			for (const a of b.assets) {
				const status = assetStatus.get(a.id);
				if (status?.bookedHere) bookedHere++;
				else if (!status?.unavailableElsewhere) availableCount++;
			}
			return {
				id: b.id,
				templateId: b.templateId,
				name: b.template.name,
				tag: b.tag,
				categoryId: b.template.categoryId,
				categoryName: b.template.category.name,
				categoryColor: b.template.category.color,
				categorySortOrder: b.template.category.sortOrder,
				organizationId: b.template.organizationId,
				organizationName: b.template.organization.name,
				organizationColor: b.template.organization.color,
				organizationAvatarLabel: b.template.organization.avatarLabel,
				locationId: b.locationId,
				locationName: b.location?.name ?? null,
				city: b.location?.address.city ?? null,
				totalAssets: b.assets.length,
				bookedHere,
				availableCount,
				memberSearchText: b.assets
					.map((a) => `${a.product.manufacturer.name} ${a.product.name}`)
					.join(' ')
					.toLowerCase()
			};
		})
		.filter((b) => b.totalAssets > 0);

	return {
		production,
		groups: [...groups.values()].sort((a, b) => a.productName.localeCompare(b.productName)),
		bundles: bundles.sort((a, b) => a.name.localeCompare(b.name))
	};
});

const setQuantitySchema = v.object({
	productionId: v.string(),
	productId: v.string(),
	organizationId: v.string(),
	locationId: v.string(),
	quantity: v.number(),
	includeBundled: v.optional(v.boolean())
});

export const setProductionQuantity = command(setQuantitySchema, async (data) => {
	const user = await requireAuth();

	const production = await prisma.production.findUniqueOrThrow({
		where: { id: data.productionId }
	});

	const currentItems = await prisma.productionItem.findMany({
		where: {
			productionId: data.productionId,
			status: { in: [...ACTIVE_STATUSES] },
			asset: {
				productId: data.productId,
				organizationId: data.organizationId,
				locationId: data.locationId
			}
		},
		select: { id: true, assetId: true }
	});

	const currentCount = currentItems.length;
	const delta = data.quantity - currentCount;
	if (delta === 0) return { changed: 0 };

	if (delta > 0) {
		let candidates = await prisma.asset.findMany({
			where: {
				productId: data.productId,
				organizationId: data.organizationId,
				locationId: data.locationId,
				id: { notIn: currentItems.map((i) => i.assetId) },
				...(data.includeBundled ? {} : { bundleId: null })
			},
			orderBy: { createdAt: 'asc' }
		});

		if (production.startDate && production.endDate) {
			const conflicting = await prisma.productionItem.findMany({
				where: {
					assetId: { in: candidates.map((a) => a.id) },
					productionId: { not: data.productionId },
					status: { in: [...CONFLICT_STATUSES] },
					production: {
						startDate: { not: null, lte: production.endDate },
						endDate: { not: null, gte: production.startDate }
					}
				},
				select: { assetId: true }
			});
			const conflictIds = new Set(conflicting.map((c) => c.assetId));
			candidates = candidates.filter((a) => !conflictIds.has(a.id));
		}

		if (candidates.length < delta) {
			throw new Error(`Only ${candidates.length} more unit(s) available to add`);
		}

		const toAdd = candidates.slice(0, delta);
		const isCrossOrg = production.organizationId !== data.organizationId;
		const status = isCrossOrg ? 'PENDING' : 'APPROVED';

		await prisma.$transaction([
			...toAdd.map((asset) =>
				prisma.productionItem.create({
					data: { productionId: data.productionId, assetId: asset.id, status }
				})
			),
			prisma.assetTransaction.createMany({
				data: toAdd.map((asset) => ({
					assetId: asset.id,
					userId: user.id,
					productionId: data.productionId,
					action: isCrossOrg ? 'REQUESTED' : 'ADDED_TO_PRODUCTION',
					data: {
						type: isCrossOrg ? 'REQUESTED' : 'ADDED_TO_PRODUCTION',
						productionId: data.productionId,
						productionName: production.name
					}
				}))
			})
		]);
	} else {
		const toRemove = currentItems.slice(0, -delta);
		await prisma.productionItem.deleteMany({ where: { id: { in: toRemove.map((i) => i.id) } } });
	}

	await getEquipmentEditorData(data.productionId).refresh();
	await getProduction(data.productionId).refresh();
	return { changed: delta };
});
