import { query, command, getRequestEvent } from '$app/server';
import { prisma } from '$lib/server/auth';
import * as v from 'valibot';

async function requireAuth() {
	const event = await getRequestEvent();
	if (!event?.locals.user) {
		throw new Error('Unauthorized');
	}
	return event.locals.user;
}

export const getProductions = query(v.string(), async (organizationId: string) => {
	await requireAuth();
	return await prisma.production.findMany({
		where: { organizationId },
		include: {
			items: {
				include: {
					asset: {
						include: { product: true }
					}
				}
			}
		},
		orderBy: { startDate: 'desc' }
	});
});

export const getProduction = query(v.string(), async (id: string) => {
	await requireAuth();
	return await prisma.production.findUniqueOrThrow({
		where: { id },
		include: {
			items: {
				include: {
					asset: {
						include: {
							product: { include: { manufacturer: true } },
							organization: true
						}
					},
					sourceBundle: { select: { id: true, name: true } }
				}
			},
			crew: {
				orderBy: { createdAt: 'asc' },
				include: { user: { select: { id: true, name: true, email: true } } }
			},
			organization: true
		}
	});
});

const createProductionSchema = v.object({
	name: v.string(),
	organizationId: v.string(),
	startDate: v.optional(v.any()),
	endDate: v.optional(v.any())
});

export const createProduction = command(createProductionSchema, async (data) => {
	const user = await requireAuth();

	const membership = await prisma.orgMembership.findUnique({
		where: { userId_organizationId: { userId: user.id, organizationId: data.organizationId } }
	});

	if (!membership) throw new Error('Not a member');

	const production = await prisma.production.create({
		data: {
			name: data.name,
			organizationId: data.organizationId,
			startDate: data.startDate,
			endDate: data.endDate
		}
	});

	getProductions(data.organizationId).refresh();
	return production;
});

const addAssetSchema = v.object({
	productionId: v.string(),
	assetId: v.string()
});

export const addAssetToProduction = command(addAssetSchema, async (data) => {
	const user = await requireAuth();

	const production = await prisma.production.findUniqueOrThrow({ where: { id: data.productionId } });
	const asset = await prisma.asset.findUniqueOrThrow({ where: { id: data.assetId } });

	const isCrossOrg = production.organizationId !== asset.organizationId;
	const initialStatus = isCrossOrg ? 'PENDING' : 'APPROVED';

	const item = await prisma.productionItem.create({
		data: {
			productionId: data.productionId,
			assetId: data.assetId,
			status: initialStatus
		}
	});

	await prisma.assetTransaction.create({
		data: {
			assetId: data.assetId,
			userId: user.id,
			productionId: data.productionId,
			action: isCrossOrg ? 'REQUESTED' : 'ADDED_TO_PRODUCTION',
			notes: isCrossOrg ? `Requested for cross-org production ${production.name}` : undefined
		}
	});

	getProduction(data.productionId).refresh();
	return item;
});

export const approveProductionItem = command(v.string(), async (itemId: string) => {
	const user = await requireAuth();

	const item = await prisma.productionItem.findUniqueOrThrow({
		where: { id: itemId },
		include: { asset: true, production: true }
	});

	const membership = await prisma.orgMembership.findUnique({
		where: { userId_organizationId: { userId: user.id, organizationId: item.asset.organizationId } }
	});

	if (!membership || (membership.role !== 'ADMIN' && membership.role !== 'OWNER')) {
		throw new Error('Unauthorized to approve assets from this org');
	}

	const updated = await prisma.productionItem.update({
		where: { id: itemId },
		data: { status: 'APPROVED' }
	});

	await prisma.assetTransaction.create({
		data: {
			assetId: item.assetId,
			userId: user.id,
			productionId: item.productionId,
			action: 'APPROVED',
			notes: `Approved for production ${item.production.name}`
		}
	});

	getProduction(item.productionId).refresh();
	getPendingApprovals(item.asset.organizationId).refresh();
	return updated;
});

export const getPendingApprovals = query(v.string(), async (organizationId: string) => {
	const user = await requireAuth();

	const membership = await prisma.orgMembership.findUnique({
		where: { userId_organizationId: { userId: user.id, organizationId } }
	});

	if (!membership || (membership.role !== 'ADMIN' && membership.role !== 'OWNER')) {
		throw new Error('Unauthorized');
	}

	return await prisma.productionItem.findMany({
		where: {
			asset: { organizationId },
			status: 'PENDING'
		},
		include: {
			asset: { include: { product: true } },
			production: { include: { organization: true } }
		}
	});
});

// ── Bundles in productions ────────────────────────────────────────────────────

const addBundleSchema = v.object({
	productionId: v.string(),
	bundleId: v.string()
});

export const addBundleToProduction = command(addBundleSchema, async (data) => {
	const user = await requireAuth();

	const production = await prisma.production.findUniqueOrThrow({ where: { id: data.productionId } });
	const bundle = await prisma.assetBundle.findUniqueOrThrow({
		where: { id: data.bundleId },
		include: { assets: true }
	});

	const existingItems = await prisma.productionItem.findMany({
		where: { productionId: data.productionId },
		select: { assetId: true }
	});
	const existingAssetIds = new Set(existingItems.map((i) => i.assetId));

	const newAssets = bundle.assets.filter((a) => !existingAssetIds.has(a.id));
	if (newAssets.length === 0) throw new Error('All bundle assets are already in this production');

	await prisma.$transaction(
		newAssets.map((asset) => {
			const isCrossOrg = production.organizationId !== asset.organizationId;
			return prisma.productionItem.create({
				data: {
					productionId: data.productionId,
					assetId: asset.id,
					sourceBundleId: data.bundleId,
					status: isCrossOrg ? 'PENDING' : 'APPROVED'
				}
			});
		})
	);

	await prisma.assetTransaction.createMany({
		data: newAssets.map((asset) => ({
			assetId: asset.id,
			userId: user.id,
			productionId: data.productionId,
			action: 'ADDED_TO_PRODUCTION',
			notes: `Added via bundle "${bundle.name}"`
		}))
	});

	getProduction(data.productionId).refresh();
	return { added: newAssets.length };
});

// ── Crew ─────────────────────────────────────────────────────────────────────

const addCrewSchema = v.object({
	productionId: v.string(),
	userId: v.string(),
	role: v.optional(v.string())
});

export const addCrewMember = command(addCrewSchema, async (data) => {
	await requireAuth();
	const member = await prisma.productionCrew.create({
		data,
		include: { user: { select: { id: true, name: true, email: true } } }
	});
	getProduction(data.productionId).refresh();
	return member;
});

export const removeCrewMember = command(v.string(), async (id: string) => {
	await requireAuth();
	const member = await prisma.productionCrew.delete({ where: { id } });
	getProduction(member.productionId).refresh();
	return member;
});

export const getCalendarData = query(async () => {
	const user = await requireAuth();

	// Fetch all assets the user has access to, along with their production items
	// that have a start and end date
	const memberships = await prisma.orgMembership.findMany({
		where: { userId: user.id }
	});
	const orgIds = memberships.map((m) => m.organizationId);

	const assets = await prisma.asset.findMany({
		where: { organizationId: { in: orgIds } },
		include: {
			product: { include: { manufacturer: true } },
			organization: true,
			productionItems: {
				where: {
					status: { in: ['APPROVED', 'CHECKED_OUT'] },
					production: {
						startDate: { not: null },
						endDate: { not: null }
					}
				},
				include: { production: true }
			}
		}
	});

	return assets;
});
