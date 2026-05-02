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
			organization: { select: { name: true } },
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
			address: true,
			crew: {
				orderBy: { createdAt: 'asc' },
				include: { user: { select: { id: true, name: true, email: true } } }
			},
			organization: true
		}
	});
});

const addressInputSchema = v.object({
	line1: v.optional(v.string()),
	line2: v.optional(v.string()),
	postalCode: v.optional(v.string()),
	city: v.optional(v.string()),
	region: v.optional(v.string()),
	country: v.optional(v.string())
});

const createProductionSchema = v.object({
	name: v.string(),
	organizationId: v.string(),
	startDate: v.optional(v.any()),
	endDate: v.optional(v.any()),
	address: v.optional(addressInputSchema)
});

export const createProduction = command(createProductionSchema, async (data) => {
	const user = await requireAuth();

	const membership = await prisma.orgMembership.findUnique({
		where: { userId_organizationId: { userId: user.id, organizationId: data.organizationId } }
	});

	if (!membership) throw new Error('Not a member');

	const hasAnyAddress =
		!!data.address &&
		Object.values(data.address).some((v) => (typeof v === 'string' ? v.trim().length > 0 : false));

	const production = await prisma.$transaction(async (tx) => {
		const address = hasAnyAddress
			? await tx.address.create({
					data: {
						line1: data.address?.line1?.trim() || null,
						line2: data.address?.line2?.trim() || null,
						postalCode: data.address?.postalCode?.trim() || null,
						city: data.address?.city?.trim() || null,
						region: data.address?.region?.trim() || null,
						country: data.address?.country?.trim() || null
					}
				})
			: null;

		return await tx.production.create({
			data: {
				name: data.name,
				organizationId: data.organizationId,
				startDate: data.startDate,
				endDate: data.endDate,
				addressId: address?.id
			},
			include: { address: true }
		});
	});

	getProductions(data.organizationId).refresh();
	return production;
});

const updateProductionAddressSchema = v.object({
	productionId: v.string(),
	address: addressInputSchema
});

export const updateProductionAddress = command(updateProductionAddressSchema, async (input) => {
	const user = await requireAuth();

	const production = await prisma.production.findUniqueOrThrow({
		where: { id: input.productionId },
		select: { id: true, organizationId: true, addressId: true }
	});

	const membership = await prisma.orgMembership.findUnique({
		where: {
			userId_organizationId: { userId: user.id, organizationId: production.organizationId }
		}
	});
	if (!membership) throw new Error('Not a member');

	const hasAny = Object.values(input.address).some((v) => (v?.trim()?.length ?? 0) > 0);

	const updated = await prisma.$transaction(async (tx) => {
		if (!hasAny) {
			return await tx.production.update({
				where: { id: input.productionId },
				data: { addressId: null },
				include: { address: true, organization: true }
			});
		}

		const addressId = production.addressId
			? (
					await tx.address.update({
						where: { id: production.addressId },
						data: {
							line1: input.address.line1?.trim() || null,
							line2: input.address.line2?.trim() || null,
							postalCode: input.address.postalCode?.trim() || null,
							city: input.address.city?.trim() || null,
							region: input.address.region?.trim() || null,
							country: input.address.country?.trim() || null
						}
					})
				).id
			: (
					await tx.address.create({
						data: {
							line1: input.address.line1?.trim() || null,
							line2: input.address.line2?.trim() || null,
							postalCode: input.address.postalCode?.trim() || null,
							city: input.address.city?.trim() || null,
							region: input.address.region?.trim() || null,
							country: input.address.country?.trim() || null
						}
					})
				).id;

		return await tx.production.update({
			where: { id: input.productionId },
			data: { addressId },
			include: { address: true, organization: true }
		});
	});

	getProduction(input.productionId).refresh();
	getProductions(production.organizationId).refresh();
	return updated;
});

const addAssetSchema = v.object({
	productionId: v.string(),
	assetId: v.string()
});

export const addAssetToProduction = command(addAssetSchema, async (data) => {
	const user = await requireAuth();

	const production = await prisma.production.findUniqueOrThrow({
		where: { id: data.productionId },
		include: { organization: { select: { id: true, name: true } } }
	});
	const asset = await prisma.asset.findUniqueOrThrow({ where: { id: data.assetId } });

	if (production.startDate && production.endDate) {
		const conflict = await prisma.productionItem.findFirst({
			where: {
				assetId: data.assetId,
				productionId: { not: data.productionId },
				status: { in: ['PENDING', 'APPROVED', 'CHECKED_OUT'] },
				production: {
					AND: [
						{ startDate: { not: null } },
						{ endDate: { not: null } },
						{ startDate: { lte: production.endDate } },
						{ endDate: { gte: production.startDate } }
					]
				}
			},
			include: { production: { select: { name: true } } }
		});
		if (conflict) {
			throw new Error(`Asset is already booked for "${conflict.production.name}" during this time`);
		}
	}

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
			data: isCrossOrg
				? {
						type: 'REQUESTED',
						productionId: data.productionId,
						productionName: production.name,
						requestingOrgId: production.organization.id,
						requestingOrgName: production.organization.name
					}
				: {
						type: 'ADDED_TO_PRODUCTION',
						productionId: data.productionId,
						productionName: production.name
					}
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
			data: {
				type: 'APPROVED',
				productionId: item.productionId,
				productionName: item.production.name
			}
		}
	});

	getProduction(item.productionId).refresh();
	getPendingApprovals(item.asset.organizationId).refresh();
	return updated;
});

export const declineProductionItem = command(v.string(), async (itemId: string) => {
	const user = await requireAuth();

	const item = await prisma.productionItem.findUniqueOrThrow({
		where: { id: itemId },
		include: { asset: true, production: true }
	});

	const membership = await prisma.orgMembership.findUnique({
		where: { userId_organizationId: { userId: user.id, organizationId: item.asset.organizationId } }
	});

	if (!membership || (membership.role !== 'ADMIN' && membership.role !== 'OWNER')) {
		throw new Error('Unauthorized to decline assets from this org');
	}

	const updated = await prisma.productionItem.update({
		where: { id: itemId },
		data: { status: 'DECLINED' }
	});

	await prisma.assetTransaction.create({
		data: {
			assetId: item.assetId,
			userId: user.id,
			productionId: item.productionId,
			action: 'DECLINED',
			data: {
				type: 'DECLINED',
				productionId: item.productionId,
				productionName: item.production.name
			}
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

	const production = await prisma.production.findUniqueOrThrow({
		where: { id: data.productionId }
	});
	const bundle = await prisma.assetBundle.findUniqueOrThrow({
		where: { id: data.bundleId },
		include: { assets: true }
	});

	const existingItems = await prisma.productionItem.findMany({
		where: { productionId: data.productionId },
		select: { assetId: true }
	});
	const existingAssetIds = new Set(existingItems.map((i) => i.assetId));

	if (bundle.assets.length === 0) throw new Error('Bundle has no assets');
	let newAssets = bundle.assets.filter((a) => !existingAssetIds.has(a.id));
	if (newAssets.length === 0) throw new Error('All bundle assets are already in this production');

	let skippedConflicts = 0;
	if (production.startDate && production.endDate) {
		const start = production.startDate;
		const end = production.endDate;
		const conflictingItems = await prisma.productionItem.findMany({
			where: {
				assetId: { in: newAssets.map((a) => a.id) },
				productionId: { not: data.productionId },
				status: { in: ['PENDING', 'APPROVED', 'CHECKED_OUT'] },
				production: {
					AND: [
						{ startDate: { not: null } },
						{ endDate: { not: null } },
						{ startDate: { lte: end } },
						{ endDate: { gte: start } }
					]
				}
			},
			select: { assetId: true }
		});
		const conflictIds = new Set(conflictingItems.map((i) => i.assetId));
		skippedConflicts = conflictIds.size;
		newAssets = newAssets.filter((a) => !conflictIds.has(a.id));
	}

	if (newAssets.length === 0)
		throw new Error('All bundle assets are already booked during this production');

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
			data: {
				productionId: data.productionId,
				productionName: production.name
			}
		}))
	});

	getProduction(data.productionId).refresh();
	return { added: newAssets.length, skippedConflicts };
});

export const removeProductionItem = command(v.string(), async (itemId: string) => {
	await requireAuth();
	const item = await prisma.productionItem.delete({ where: { id: itemId } });
	getProduction(item.productionId).refresh();
	return item;
});

const removeBundleFromProductionSchema = v.object({
	productionId: v.string(),
	bundleId: v.string()
});

export const removeBundleFromProduction = command(
	removeBundleFromProductionSchema,
	async (data) => {
		await requireAuth();
		await prisma.productionItem.deleteMany({
			where: { productionId: data.productionId, sourceBundleId: data.bundleId }
		});
		getProduction(data.productionId).refresh();
	}
);

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

export const getBookedAssets = query(
	v.string(),
	async (productionId: string): Promise<{ assetId: string; productionName: string }[]> => {
		await requireAuth();
		const production = await prisma.production.findUniqueOrThrow({
			where: { id: productionId },
			select: { startDate: true, endDate: true }
		});
		if (!production.startDate || !production.endDate) return [];
		const items = await prisma.productionItem.findMany({
			where: {
				productionId: { not: productionId },
				status: { in: ['PENDING', 'APPROVED', 'CHECKED_OUT'] },
				production: {
					AND: [
						{ startDate: { not: null } },
						{ endDate: { not: null } },
						{ startDate: { lte: production.endDate } },
						{ endDate: { gte: production.startDate } }
					]
				}
			},
			select: { assetId: true, production: { select: { name: true } } }
		});
		const seen = new Map<string, string>();
		for (const item of items) {
			if (!seen.has(item.assetId)) seen.set(item.assetId, item.production.name);
		}
		return [...seen.entries()].map(([assetId, productionName]) => ({ assetId, productionName }));
	}
);

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
					status: { in: ['APPROVED', 'CHECKED_OUT', 'PENDING'] },
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

export const getProductionsCalendar = query(async () => {
	const user = await requireAuth();
	const memberships = await prisma.orgMembership.findMany({
		where: { userId: user.id }
	});
	const orgIds = memberships.map((m) => m.organizationId);
	return await prisma.production.findMany({
		where: {
			organizationId: { in: orgIds },
			startDate: { not: null },
			endDate: { not: null }
		},
		include: { organization: { select: { name: true } } },
		orderBy: { startDate: 'asc' }
	});
});
