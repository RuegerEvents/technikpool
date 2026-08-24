import { query, command } from '$app/server';
import { prisma } from '$lib/server/auth';
import { sendMail } from '$lib/server/mail';
import { appBaseUrl } from '$lib/server/app-url';
import { pendingApprovalEmail } from '$lib/server/emails/pending-approval';
import { bookingReviewedEmail } from '$lib/server/emails/booking-reviewed';
import { addedAsCrewEmail } from '$lib/server/emails/added-as-crew';
import * as v from 'valibot';
import { requireAuth } from '$lib/server/services/access';

// Returns which of `ownerOrgIds` do NOT currently have any PENDING item in
// this production — i.e. the orgs for which a new PENDING item would be the
// first one, and thus warrants a notification email. Must be called BEFORE
// creating the new items.
async function getOrgIdsNeedingApprovalNotification(productionId: string, ownerOrgIds: string[]) {
	if (ownerOrgIds.length === 0) return [];
	const alreadyPending = await prisma.productionItem.findMany({
		where: {
			productionId,
			status: 'PENDING',
			asset: { organizationId: { in: ownerOrgIds } }
		},
		select: { asset: { select: { organizationId: true } } }
	});
	const alreadyPendingOrgIds = new Set(alreadyPending.map((i) => i.asset.organizationId));
	return ownerOrgIds.filter((id) => !alreadyPendingOrgIds.has(id));
}

// Emails the OWNER/ADMIN members of each owning org once per "batch" of
// approval requests — the caller only passes orgs for which this is the
// first pending item in the production, so the next email only goes out
// once the queue is cleared and refilled.
async function notifyPendingApproval(
	productionId: string,
	productionName: string,
	requestingOrgName: string,
	ownerOrgIds: string[]
) {
	await Promise.all(
		ownerOrgIds.map(async (ownerOrgId) => {
			try {
				const [pendingCount, org, recipients] = await Promise.all([
					prisma.productionItem.count({
						where: { productionId, status: 'PENDING', asset: { organizationId: ownerOrgId } }
					}),
					prisma.organization.findUniqueOrThrow({
						where: { id: ownerOrgId },
						select: { name: true }
					}),
					prisma.orgMembership.findMany({
						where: { organizationId: ownerOrgId, role: { in: ['OWNER', 'ADMIN'] } },
						include: { user: { select: { email: true, name: true } } }
					})
				]);

				await Promise.all(
					recipients.map((membership) => {
						const { subject, html, text } = pendingApprovalEmail({
							name: membership.user.name,
							ownerOrgName: org.name,
							requestingOrgName,
							productionName,
							pendingCount,
							url: appBaseUrl
						});
						return sendMail({ to: membership.user.email, subject, html, text });
					})
				);
			} catch (err) {
				console.error(`Failed to send pending-approval email for org ${ownerOrgId}:`, err);
			}
		})
	);
}

// Called after an item is approved/declined. Once the (production, ownerOrg)
// PENDING queue is fully cleared, tells the requesting org's OWNER/ADMIN
// members that their requests were reviewed — a single email regardless of
// how many items were resolved in this batch (e.g. via "approve all").
async function notifyRequesterIfQueueCleared(
	productionId: string,
	requestingOrgId: string,
	ownerOrgId: string
) {
	try {
		const remainingPending = await prisma.productionItem.count({
			where: { productionId, status: 'PENDING', asset: { organizationId: ownerOrgId } }
		});
		if (remainingPending > 0) return;

		const [production, ownerOrg, recipients] = await Promise.all([
			prisma.production.findUniqueOrThrow({ where: { id: productionId }, select: { name: true } }),
			prisma.organization.findUniqueOrThrow({ where: { id: ownerOrgId }, select: { name: true } }),
			prisma.orgMembership.findMany({
				where: { organizationId: requestingOrgId, role: { in: ['OWNER', 'ADMIN'] } },
				include: { user: { select: { email: true, name: true } } }
			})
		]);

		await Promise.all(
			recipients.map((membership) => {
				const { subject, html, text } = bookingReviewedEmail({
					name: membership.user.name,
					ownerOrgName: ownerOrg.name,
					productionName: production.name,
					url: `${appBaseUrl}/productions/${productionId}`
				});
				return sendMail({ to: membership.user.email, subject, html, text });
			})
		);
	} catch (err) {
		console.error(`Failed to send booking-reviewed email for production ${productionId}:`, err);
	}
}

export const getProductions = query(v.optional(v.string()), async (organizationId?: string) => {
	const user = await requireAuth();
	const memberships = await prisma.orgMembership.findMany({
		where: { userId: user.id },
		select: { organizationId: true }
	});
	const orgIds = organizationId ? [organizationId] : memberships.map((m) => m.organizationId);
	return await prisma.production.findMany({
		where: { organizationId: { in: orgIds } },
		include: {
			organization: { select: { name: true, shortName: true } },
			items: {
				include: {
					asset: {
						include: { product: true }
					}
				}
			}
		},
		orderBy: { startDate: 'asc' }
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
					sourceBundle: { select: { id: true, template: { select: { name: true } } } }
				}
			},
			address: true,
			customer: { include: { address: true } },
			crew: {
				orderBy: { createdAt: 'asc' },
				include: { user: { select: { id: true, name: true, email: true } } }
			},
			organization: true
		}
	});
});

const addressInputSchema = v.object({
	line1: v.string(),
	line2: v.optional(v.string()),
	postalCode: v.string(),
	city: v.string()
});

const createProductionSchema = v.object({
	name: v.string(),
	organizationId: v.string(),
	startDate: v.optional(v.any()),
	endDate: v.optional(v.any()),
	showStartDate: v.optional(v.any()),
	showEndDate: v.optional(v.any()),
	address: v.optional(addressInputSchema),
	customerId: v.optional(v.string())
});

// Total duration governs asset blocking/calendar; show duration (if set) must
// fall inside it and is used for offer/invoice day-count.
function validateDuration(input: {
	startDate?: Date | null;
	endDate?: Date | null;
	showStartDate?: Date | null;
	showEndDate?: Date | null;
}) {
	const { startDate, endDate, showStartDate, showEndDate } = input;
	if (startDate && endDate && endDate.getTime() < startDate.getTime()) {
		throw new Error('End date cannot be before start date');
	}
	if (showStartDate && showEndDate && showEndDate.getTime() < showStartDate.getTime()) {
		throw new Error('Show end date cannot be before show start date');
	}
	if (showStartDate && startDate && showStartDate.getTime() < startDate.getTime()) {
		throw new Error('Show start date cannot be before the total start date');
	}
	if (showEndDate && endDate && showEndDate.getTime() > endDate.getTime()) {
		throw new Error('Show end date cannot be after the total end date');
	}
}

export const createProduction = command(createProductionSchema, async (data) => {
	const user = await requireAuth();

	const membership = await prisma.orgMembership.findUnique({
		where: { userId_organizationId: { userId: user.id, organizationId: data.organizationId } }
	});

	if (!membership) throw new Error('Not a member');

	const startDate = data.startDate ? new Date(data.startDate) : null;
	const endDate = data.endDate ? new Date(data.endDate) : null;
	const showStartDate = data.showStartDate ? new Date(data.showStartDate) : null;
	const showEndDate = data.showEndDate ? new Date(data.showEndDate) : null;
	validateDuration({ startDate, endDate, showStartDate, showEndDate });

	const hasAnyAddress =
		!!data.address &&
		Object.values(data.address).some((v) => (typeof v === 'string' ? v.trim().length > 0 : false));

	const production = await prisma.$transaction(async (tx) => {
		const address = hasAnyAddress
			? await tx.address.create({
					data: {
						line1: data.address!.line1.trim(),
						line2: data.address?.line2?.trim() || null,
						postalCode: data.address!.postalCode.trim(),
						city: data.address!.city.trim()
					}
				})
			: null;

		return await tx.production.create({
			data: {
				name: data.name,
				organizationId: data.organizationId,
				startDate,
				endDate,
				showStartDate,
				showEndDate,
				addressId: address?.id,
				customerId: data.customerId || null
			},
			include: { address: true, customer: { include: { address: true } } }
		});
	});

	await getProductions(data.organizationId).refresh();
	await getProductions().refresh();
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
							line1: input.address.line1.trim(),
							line2: input.address.line2?.trim() || null,
							postalCode: input.address.postalCode.trim(),
							city: input.address.city.trim()
						}
					})
				).id
			: (
					await tx.address.create({
						data: {
							line1: input.address.line1.trim(),
							line2: input.address.line2?.trim() || null,
							postalCode: input.address.postalCode.trim(),
							city: input.address.city.trim()
						}
					})
				).id;

		return await tx.production.update({
			where: { id: input.productionId },
			data: { addressId },
			include: { address: true, organization: true }
		});
	});

	await getProduction(input.productionId).refresh();
	await getProductions(production.organizationId).refresh();
	await getProductions().refresh();
	return updated;
});

const updateProductionDurationSchema = v.object({
	productionId: v.string(),
	startDate: v.optional(v.any()),
	endDate: v.optional(v.any()),
	showStartDate: v.optional(v.any()),
	showEndDate: v.optional(v.any())
});

export const updateProductionDuration = command(updateProductionDurationSchema, async (input) => {
	const user = await requireAuth();

	const production = await prisma.production.findUniqueOrThrow({
		where: { id: input.productionId },
		select: { id: true, organizationId: true }
	});

	const membership = await prisma.orgMembership.findUnique({
		where: {
			userId_organizationId: { userId: user.id, organizationId: production.organizationId }
		}
	});
	if (!membership) throw new Error('Not a member');

	const startDate = input.startDate ? new Date(input.startDate) : null;
	const endDate = input.endDate ? new Date(input.endDate) : null;
	const showStartDate = input.showStartDate ? new Date(input.showStartDate) : null;
	const showEndDate = input.showEndDate ? new Date(input.showEndDate) : null;
	validateDuration({ startDate, endDate, showStartDate, showEndDate });

	const updated = await prisma.production.update({
		where: { id: input.productionId },
		data: { startDate, endDate, showStartDate, showEndDate }
	});

	await getProduction(input.productionId).refresh();
	await getProductions(production.organizationId).refresh();
	await getProductions().refresh();
	return updated;
});

const updateProductionCustomerSchema = v.object({
	productionId: v.string(),
	customerId: v.optional(v.string())
});

export const updateProductionCustomer = command(updateProductionCustomerSchema, async (input) => {
	const user = await requireAuth();

	const production = await prisma.production.findUniqueOrThrow({
		where: { id: input.productionId },
		select: { id: true, organizationId: true }
	});

	const membership = await prisma.orgMembership.findUnique({
		where: {
			userId_organizationId: { userId: user.id, organizationId: production.organizationId }
		}
	});
	if (!membership) throw new Error('Not a member');

	const updated = await prisma.production.update({
		where: { id: input.productionId },
		data: { customerId: input.customerId || null },
		include: { customer: { include: { address: true } } }
	});

	await getProduction(input.productionId).refresh();
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
		include: { organization: { select: { id: true, name: true, shortName: true } } }
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

	const orgsToNotify = isCrossOrg
		? await getOrgIdsNeedingApprovalNotification(data.productionId, [asset.organizationId])
		: [];

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

	if (orgsToNotify.length > 0) {
		await notifyPendingApproval(
			data.productionId,
			production.name,
			production.organization.name,
			orgsToNotify
		);
	}

	await getProduction(data.productionId).refresh();
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

	await notifyRequesterIfQueueCleared(
		item.productionId,
		item.production.organizationId,
		item.asset.organizationId
	);

	await getProduction(item.productionId).refresh();
	await getPendingApprovals(item.asset.organizationId).refresh();
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

	await notifyRequesterIfQueueCleared(
		item.productionId,
		item.production.organizationId,
		item.asset.organizationId
	);

	await getProduction(item.productionId).refresh();
	await getPendingApprovals(item.asset.organizationId).refresh();
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
		where: { id: data.productionId },
		include: { organization: { select: { name: true } } }
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

	const crossOrgIds = [
		...new Set(
			newAssets
				.filter((a) => a.organizationId !== production.organizationId)
				.map((a) => a.organizationId)
		)
	];
	const orgsToNotify = await getOrgIdsNeedingApprovalNotification(data.productionId, crossOrgIds);

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

	if (orgsToNotify.length > 0) {
		await notifyPendingApproval(
			data.productionId,
			production.name,
			production.organization.name,
			orgsToNotify
		);
	}

	await getProduction(data.productionId).refresh();
	return { added: newAssets.length, skippedConflicts };
});

export const removeProductionItem = command(v.string(), async (itemId: string) => {
	await requireAuth();
	const item = await prisma.productionItem.delete({ where: { id: itemId } });
	await getProduction(item.productionId).refresh();
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
		await getProduction(data.productionId).refresh();
	}
);

const syncBundleSchema = v.object({
	productionId: v.string(),
	bundleId: v.string()
});

export const syncBundleInProduction = command(syncBundleSchema, async (data) => {
	const user = await requireAuth();

	const production = await prisma.production.findUniqueOrThrow({
		where: { id: data.productionId },
		include: { organization: { select: { id: true, name: true } } }
	});
	const bundle = await prisma.assetBundle.findUniqueOrThrow({
		where: { id: data.bundleId },
		include: { assets: true }
	});

	const currentItems = await prisma.productionItem.findMany({
		where: { productionId: data.productionId, sourceBundleId: data.bundleId }
	});

	const currentItemAssetIds = new Set(currentItems.map((i) => i.assetId));
	const bundleAssetIds = new Set(bundle.assets.map((a) => a.id));

	const toRemove = currentItems.filter((i) => !bundleAssetIds.has(i.assetId));

	const allProductionItems = await prisma.productionItem.findMany({
		where: { productionId: data.productionId },
		select: { assetId: true }
	});
	const allProductionAssetIds = new Set(allProductionItems.map((i) => i.assetId));

	let toAdd = bundle.assets.filter(
		(a) => !currentItemAssetIds.has(a.id) && !allProductionAssetIds.has(a.id)
	);

	let skippedConflicts = 0;
	if (production.startDate && production.endDate) {
		const start = production.startDate;
		const end = production.endDate;
		const conflictingItems = await prisma.productionItem.findMany({
			where: {
				assetId: { in: toAdd.map((a) => a.id) },
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
		toAdd = toAdd.filter((a) => !conflictIds.has(a.id));
	}

	const crossOrgIds = [
		...new Set(
			toAdd
				.filter((a) => a.organizationId !== production.organizationId)
				.map((a) => a.organizationId)
		)
	];
	const orgsToNotify = await getOrgIdsNeedingApprovalNotification(data.productionId, crossOrgIds);

	await prisma.$transaction([
		...toRemove.map((item) => prisma.productionItem.delete({ where: { id: item.id } })),
		...toAdd.map((asset) => {
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
	]);

	if (toAdd.length > 0) {
		await prisma.assetTransaction.createMany({
			data: toAdd.map((asset) => ({
				assetId: asset.id,
				userId: user.id,
				productionId: data.productionId,
				action: 'ADDED_TO_PRODUCTION',
				data: { productionId: data.productionId, productionName: production.name }
			}))
		});
	}

	if (orgsToNotify.length > 0) {
		await notifyPendingApproval(
			data.productionId,
			production.name,
			production.organization.name,
			orgsToNotify
		);
	}

	await getProduction(data.productionId).refresh();
	return { removed: toRemove.length, added: toAdd.length, skippedConflicts };
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

	const production = await prisma.production.findUniqueOrThrow({
		where: { id: data.productionId },
		select: { name: true, startDate: true, endDate: true }
	});

	try {
		const { subject, html, text } = addedAsCrewEmail({
			name: member.user.name,
			productionName: production.name,
			role: member.role,
			startDate: production.startDate,
			endDate: production.endDate,
			url: `${appBaseUrl}/productions/${data.productionId}`
		});
		await sendMail({ to: member.user.email, subject, html, text });
	} catch (err) {
		console.error(`Failed to send added-as-crew email for production ${data.productionId}:`, err);
	}

	await getProduction(data.productionId).refresh();
	return member;
});

export const removeCrewMember = command(v.string(), async (id: string) => {
	await requireAuth();
	const member = await prisma.productionCrew.delete({ where: { id } });
	await getProduction(member.productionId).refresh();
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
			bundle: { select: { id: true, template: { select: { name: true } } } },
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
		include: { organization: { select: { name: true, shortName: true } } },
		orderBy: { startDate: 'asc' }
	});
});

export const getDashboardStats = query(async () => {
	const user = await requireAuth();
	const memberships = await prisma.orgMembership.findMany({ where: { userId: user.id } });
	const orgIds = memberships.map((m) => m.organizationId);
	const now = new Date();

	const [
		totalAssets,
		availableAssets,
		maintenanceAssets,
		brokenAssets,
		upcomingProductions,
		bundleCount,
		overdueInspections
	] = await Promise.all([
		prisma.asset.count({ where: { organizationId: { in: orgIds } } }),
		prisma.asset.count({ where: { organizationId: { in: orgIds }, status: 'AVAILABLE' } }),
		prisma.asset.count({ where: { organizationId: { in: orgIds }, status: 'MAINTENANCE' } }),
		prisma.asset.count({ where: { organizationId: { in: orgIds }, status: 'BROKEN' } }),
		prisma.production.findMany({
			where: { organizationId: { in: orgIds }, startDate: { gte: now } },
			orderBy: { startDate: 'asc' },
			take: 5,
			select: {
				id: true,
				name: true,
				startDate: true,
				endDate: true,
				organization: { select: { name: true, shortName: true } },
				_count: { select: { items: true, crew: true } }
			}
		}),
		prisma.assetBundle.count({ where: { template: { organizationId: { in: orgIds } } } }),
		prisma.asset.count({
			where: { organizationId: { in: orgIds }, nextInspectionDue: { not: null, lt: now } }
		})
	]);

	return {
		totalAssets,
		assetsByStatus: {
			available: availableAssets,
			maintenance: maintenanceAssets,
			broken: brokenAssets
		},
		upcomingProductions,
		bundleCount,
		overdueInspections
	};
});
