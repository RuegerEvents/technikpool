import { query, command } from '$app/server';
import { prisma } from '$lib/server/auth';
import { sendMail } from '$lib/server/mail';
import { appBaseUrl } from '$lib/server/app-url';
import { pendingApprovalEmail } from '$lib/server/emails/pending-approval';
import { bookingReviewedEmail } from '$lib/server/emails/booking-reviewed';
import { addedAsCrewEmail } from '$lib/server/emails/added-as-crew';
import * as v from 'valibot';
import {
	productionVisibility,
	requireAuth,
	requireOrgInventory,
	requireOrgRead,
	requireOrgWrite,
	scopedOrgIds,
	visibleProductionIds
} from '$lib/server/services/access';
import { ACTIVE_ASSET_WHERE, isBookableStatus, isRetiredStatus } from '$lib/asset-status';
import { accessoryIdsOf } from '$lib/server/services/accessories';
import { appError } from '$lib/errors';
import { orgLabel } from '$lib/utils';
import type { AddedToProductionData, RequestedData } from '$lib/types/asset-transaction';

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
	const orgIds = await scopedOrgIds(user.id, organizationId);
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
	const production = await prisma.production.findUniqueOrThrow({
		where: { id },
		include: {
			items: {
				include: {
					asset: {
						include: {
							product: { include: { manufacturer: true } },
							organization: true,
							accessories: { select: { id: true } }
						}
					},
					sourceBundle: { select: { id: true, template: { select: { name: true } } } }
				},
				// The page groups these into sections in the order it meets them, and
				// the print routes walk them as they come — so an unordered list is a
				// packing list whose sections move between two prints of it. Same
				// order as every other list of units: product, then tag.
				orderBy: [
					{ asset: { product: { name: 'asc' } } },
					{ asset: { assetTag: { sort: 'asc', nulls: 'last' } } },
					{ assetId: 'asc' }
				]
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
	// Any member of the org reads it, VIEWER included; every command that
	// changes it asks for MEMBER on its own.
	await requireOrgRead(production.organizationId);
	return production;
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
		appError(400, 'dates_end_before_start');
	}
	if (showStartDate && showEndDate && showEndDate.getTime() < showStartDate.getTime()) {
		appError(400, 'show_end_before_show_start');
	}
	if (showStartDate && startDate && showStartDate.getTime() < startDate.getTime()) {
		appError(400, 'show_start_before_start');
	}
	if (showEndDate && endDate && showEndDate.getTime() > endDate.getTime()) {
		appError(400, 'show_end_after_end');
	}
}

export const createProduction = command(createProductionSchema, async (data) => {
	await requireOrgWrite(data.organizationId);

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

export const deleteProduction = command(v.string(), async (productionId: string) => {
	const production = await prisma.production.findUniqueOrThrow({
		where: { id: productionId },
		select: { id: true, name: true, organizationId: true, addressId: true }
	});
	await requireOrgInventory(production.organizationId, 'production_delete_forbidden');

	await prisma.$transaction(async (tx) => {
		await tx.production.delete({ where: { id: productionId } });
		// Production addresses are created as private records. Remove the orphan
		// only when nothing else has since been linked to it.
		if (production.addressId) {
			const references = await Promise.all([
				tx.organization.count({ where: { addressId: production.addressId } }),
				tx.location.count({ where: { addressId: production.addressId } }),
				tx.customer.count({ where: { addressId: production.addressId } }),
				tx.production.count({ where: { addressId: production.addressId } })
			]);
			if (references.every((count) => count === 0)) {
				await tx.address.delete({ where: { id: production.addressId } });
			}
		}
	});

	await Promise.all([
		getProductions(production.organizationId).refresh(),
		getProductions().refresh()
	]);
	return { id: production.id, name: production.name };
});

const updateProductionAddressSchema = v.object({
	productionId: v.string(),
	address: addressInputSchema
});

export const updateProductionAddress = command(updateProductionAddressSchema, async (input) => {
	const production = await prisma.production.findUniqueOrThrow({
		where: { id: input.productionId },
		select: { id: true, organizationId: true, addressId: true }
	});

	await requireOrgWrite(production.organizationId);

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
	const production = await prisma.production.findUniqueOrThrow({
		where: { id: input.productionId },
		select: { id: true, organizationId: true }
	});

	await requireOrgWrite(production.organizationId);

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
	const production = await prisma.production.findUniqueOrThrow({
		where: { id: input.productionId },
		select: { id: true, organizationId: true }
	});

	await requireOrgWrite(production.organizationId);

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
	await requireOrgWrite(production.organizationId);

	const asset = await prisma.asset.findUniqueOrThrow({ where: { id: data.assetId } });
	if (isRetiredStatus(asset.status)) {
		appError(409, 'asset_retired_no_booking');
	}
	if (!isBookableStatus(asset.status)) {
		appError(409, 'asset_unavailable_no_booking');
	}

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
			appError(409, 'asset_booking_conflict', [conflict.production.name]);
		}
	}

	const isCrossOrg = production.organizationId !== asset.organizationId;
	const initialStatus = isCrossOrg ? 'PENDING' : 'APPROVED';

	const orgsToNotify = isCrossOrg
		? await getOrgIdsNeedingApprovalNotification(data.productionId, [asset.organizationId])
		: [];

	// Whatever is attached to it is booked with it — see
	// src/lib/server/services/accessories.ts. No conflict check of its own: an
	// accessory is never booked independently, so the check above covers it.
	const accessoryIds = (await accessoryIdsOf([data.assetId])).get(data.assetId) ?? [];

	const item = await prisma.productionItem.create({
		data: {
			productionId: data.productionId,
			assetId: data.assetId,
			status: initialStatus
		}
	});
	if (accessoryIds.length > 0) {
		await prisma.productionItem.createMany({
			data: accessoryIds.map((assetId) => ({
				productionId: data.productionId,
				assetId,
				sourceParentAssetId: data.assetId,
				status: initialStatus
			})),
			skipDuplicates: true
		});
	}

	await prisma.assetTransaction.create({
		data: {
			assetId: data.assetId,
			userId: user.id,
			productionId: data.productionId,
			action: isCrossOrg ? 'REQUESTED' : 'ADDED_TO_PRODUCTION',
			data: isCrossOrg
				? ({
						type: 'REQUESTED',
						productionId: data.productionId,
						productionName: production.name,
						requestingOrgId: production.organization.id,
						requestingOrgName: production.organization.name
					} satisfies RequestedData)
				: ({
						type: 'ADDED_TO_PRODUCTION',
						productionId: data.productionId,
						productionName: production.name
					} satisfies AddedToProductionData)
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

	await requireOrgInventory(item.asset.organizationId, 'approval_forbidden');

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

	// The approver answers for the unit, not for the production that asked for
	// it, and may not be allowed to open that — see `visibleProductionIds`.
	if ((await visibleProductionIds(user.id, [item.productionId])).length > 0) {
		await getProduction(item.productionId).refresh();
	}
	await getPendingApprovals(item.asset.organizationId).refresh();
	return updated;
});

export const declineProductionItem = command(v.string(), async (itemId: string) => {
	const user = await requireAuth();

	const item = await prisma.productionItem.findUniqueOrThrow({
		where: { id: itemId },
		include: { asset: true, production: true }
	});

	await requireOrgInventory(item.asset.organizationId, 'decline_forbidden');

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

	// The approver answers for the unit, not for the production that asked for
	// it, and may not be allowed to open that — see `visibleProductionIds`.
	if ((await visibleProductionIds(user.id, [item.productionId])).length > 0) {
		await getProduction(item.productionId).refresh();
	}
	await getPendingApprovals(item.asset.organizationId).refresh();
	return updated;
});

export const getPendingApprovals = query(v.string(), async (organizationId: string) => {
	const user = await requireOrgInventory(organizationId);
	const canSee = await productionVisibility(user.id);

	const items = await prisma.productionItem.findMany({
		where: {
			asset: { organizationId },
			status: 'PENDING'
		},
		include: {
			asset: { include: { product: true } },
			production: { include: { organization: true } }
		}
	});
	// A request names the production it is for — deciding to lend means knowing
	// what to — but the lender usually belongs to a different org and may not
	// open it, so the page is told whether to link it.
	return items.map((item) => ({
		...item,
		productionVisible: canSee(item.production.organizationId)
	}));
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
	await requireOrgWrite(production.organizationId);

	const bundle = await prisma.assetBundle.findUniqueOrThrow({
		where: { id: data.bundleId },
		include: { assets: true }
	});

	const existingItems = await prisma.productionItem.findMany({
		where: { productionId: data.productionId },
		select: { id: true, assetId: true, sourceBundleId: true }
	});
	const existingAssetIds = new Set(existingItems.map((i) => i.assetId));

	if (bundle.assets.length === 0) appError(409, 'bundle_empty');

	// Units of this bundle that are already booked here on their own — putting
	// booked assets into a bundle and then adding that bundle is the ordinary
	// way to arrive at this. The bundle adopts them instead of leaving the same
	// unit listed both individually and under the bundle.
	const bundleAssetIds = new Set(bundle.assets.map((a) => a.id));
	const adoptable = existingItems.filter(
		(i) => bundleAssetIds.has(i.assetId) && i.sourceBundleId === null
	);

	// A unit the bundle carries but that cannot be planned with is simply left
	// behind: booking the rest of the bundle is what the user asked for, and
	// refusing the whole bundle over one unavailable unit helps nobody.
	let newAssets = bundle.assets.filter(
		(a) => !existingAssetIds.has(a.id) && isBookableStatus(a.status)
	);
	if (newAssets.length === 0 && adoptable.length === 0) {
		appError(409, 'bundle_all_in_production');
	}

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

	if (newAssets.length === 0 && adoptable.length === 0) appError(409, 'bundle_all_booked');

	const crossOrgIds = [
		...new Set(
			newAssets
				.filter((a) => a.organizationId !== production.organizationId)
				.map((a) => a.organizationId)
		)
	];
	const orgsToNotify = await getOrgIdsNeedingApprovalNotification(data.productionId, crossOrgIds);

	await prisma.$transaction([
		...newAssets.map((asset) => {
			const isCrossOrg = production.organizationId !== asset.organizationId;
			return prisma.productionItem.create({
				data: {
					productionId: data.productionId,
					assetId: asset.id,
					sourceBundleId: data.bundleId,
					sourceParentAssetId: asset.parentAssetId,
					status: isCrossOrg ? 'PENDING' : 'APPROVED'
				}
			});
		}),
		// Adoption only moves which row a unit is listed under; its approval
		// status was already settled when it was booked.
		...(adoptable.length > 0
			? [
					prisma.productionItem.updateMany({
						where: { id: { in: adoptable.map((i) => i.id) } },
						data: { sourceBundleId: data.bundleId }
					})
				]
			: [])
	]);

	await prisma.assetTransaction.createMany({
		data: newAssets.map((asset) => ({
			assetId: asset.id,
			userId: user.id,
			productionId: data.productionId,
			action: 'ADDED_TO_PRODUCTION',
			data: {
				type: 'ADDED_TO_PRODUCTION',
				productionId: data.productionId,
				productionName: production.name
			} satisfies AddedToProductionData
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
	return { added: newAssets.length, adopted: adoptable.length, skippedConflicts };
});

export const removeProductionItem = command(v.string(), async (itemId: string) => {
	// Read before the delete: the row is the only thing that names the org this
	// has to be authorized against, and afterwards it is gone.
	const { production } = await prisma.productionItem.findUniqueOrThrow({
		where: { id: itemId },
		select: { production: { select: { organizationId: true } } }
	});
	await requireOrgWrite(production.organizationId);

	const item = await prisma.productionItem.delete({ where: { id: itemId } });
	// The accessories were booked because the parent was; they go with it.
	await prisma.productionItem.deleteMany({
		where: { productionId: item.productionId, sourceParentAssetId: item.assetId }
	});
	await getProduction(item.productionId).refresh();
	return item;
});

const syncAssetAccessoriesSchema = v.object({
	productionId: v.string(),
	assetId: v.string()
});

export const syncAssetAccessoriesInProduction = command(
	syncAssetAccessoriesSchema,
	async ({ productionId, assetId }) => {
		const parentItem = await prisma.productionItem.findUniqueOrThrow({
			where: { productionId_assetId: { productionId, assetId } },
			include: { production: { select: { organizationId: true } } }
		});
		await requireOrgWrite(parentItem.production.organizationId);
		const currentAccessories = await prisma.asset.findMany({
			where: { parentAssetId: assetId },
			select: { id: true }
		});
		const bookedAccessories = await prisma.productionItem.findMany({
			where: { productionId, sourceParentAssetId: assetId }
		});
		const currentIds = new Set(currentAccessories.map((asset) => asset.id));
		const bookedIds = new Set(bookedAccessories.map((item) => item.assetId));
		const toRemove = bookedAccessories.filter((item) => !currentIds.has(item.assetId));
		const toAdd = currentAccessories.filter((asset) => !bookedIds.has(asset.id));

		await prisma.$transaction([
			prisma.productionItem.deleteMany({ where: { id: { in: toRemove.map((item) => item.id) } } }),
			...(toAdd.length > 0
				? [
						prisma.productionItem.createMany({
							data: toAdd.map((asset) => ({
								productionId,
								assetId: asset.id,
								sourceBundleId: parentItem.sourceBundleId,
								sourceParentAssetId: assetId,
								status: parentItem.status
							})),
							skipDuplicates: true
						})
					]
				: [])
		]);
		await getProduction(productionId).refresh();
		return { added: toAdd.length, removed: toRemove.length };
	}
);

const removeBundleFromProductionSchema = v.object({
	productionId: v.string(),
	bundleId: v.string()
});

export const removeBundleFromProduction = command(
	removeBundleFromProductionSchema,
	async (data) => {
		const production = await prisma.production.findUniqueOrThrow({
			where: { id: data.productionId },
			select: { organizationId: true }
		});
		await requireOrgWrite(production.organizationId);

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
	await requireOrgWrite(production.organizationId);

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
		select: { id: true, assetId: true, sourceBundleId: true }
	});
	const allProductionAssetIds = new Set(allProductionItems.map((i) => i.assetId));

	// Members that are booked here on their own move under the bundle rather
	// than staying listed twice — same rule as adding the bundle.
	const adoptable = allProductionItems.filter(
		(i) => bundleAssetIds.has(i.assetId) && i.sourceBundleId === null
	);

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
					sourceParentAssetId: asset.parentAssetId,
					status: isCrossOrg ? 'PENDING' : 'APPROVED'
				}
			});
		}),
		...(adoptable.length > 0
			? [
					prisma.productionItem.updateMany({
						where: { id: { in: adoptable.map((i) => i.id) } },
						data: { sourceBundleId: data.bundleId }
					})
				]
			: [])
	]);

	if (toAdd.length > 0) {
		await prisma.assetTransaction.createMany({
			data: toAdd.map((asset) => ({
				assetId: asset.id,
				userId: user.id,
				productionId: data.productionId,
				action: 'ADDED_TO_PRODUCTION',
				data: {
					type: 'ADDED_TO_PRODUCTION',
					productionId: data.productionId,
					productionName: production.name
				} satisfies AddedToProductionData
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
	return {
		removed: toRemove.length,
		added: toAdd.length,
		adopted: adoptable.length,
		skippedConflicts
	};
});

// ── Crew ─────────────────────────────────────────────────────────────────────

const addCrewSchema = v.object({
	productionId: v.string(),
	userId: v.string(),
	role: v.optional(v.string())
});

export const addCrewMember = command(addCrewSchema, async (data) => {
	const production = await prisma.production.findUniqueOrThrow({
		where: { id: data.productionId },
		select: { name: true, startDate: true, endDate: true, organizationId: true }
	});
	await requireOrgWrite(production.organizationId);

	const member = await prisma.productionCrew.create({
		data,
		include: { user: { select: { id: true, name: true, email: true } } }
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
	const { production } = await prisma.productionCrew.findUniqueOrThrow({
		where: { id },
		select: { production: { select: { organizationId: true } } }
	});
	await requireOrgWrite(production.organizationId);

	const member = await prisma.productionCrew.delete({ where: { id } });
	await getProduction(member.productionId).refresh();
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
	const canSee = await productionVisibility(user.id);

	// An accessory's availability is its parent's — it is booked and returned
	// with it, so a row per power cable is noise on a calendar.
	const assets = await prisma.asset.findMany({
		where: { organizationId: { in: orgIds }, parentAssetId: null, ...ACTIVE_ASSET_WHERE },
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
				include: {
					production: {
						select: {
							id: true,
							name: true,
							startDate: true,
							endDate: true,
							showStartDate: true,
							showEndDate: true,
							organizationId: true,
							organization: { select: { name: true, shortName: true } }
						}
					}
				}
			}
		}
	});

	// A unit lent to another org's production is booked all the same, so the
	// booking stays — but someone outside that org gets a block with the org's
	// name on it and nothing else: no title, no setup/show split, nothing to open.
	return assets.map((asset) => ({
		...asset,
		productionItems: asset.productionItems.map(({ production, ...item }) => {
			const { organization, organizationId, ...rest } = production;
			return {
				...item,
				production: canSee(organizationId)
					? { ...rest, restricted: false }
					: {
							...rest,
							name: orgLabel(organization),
							showStartDate: null,
							showEndDate: null,
							restricted: true
						}
			};
		})
	}));
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
		// Customer, venue and counts feed the calendar's hover card.
		include: {
			organization: { select: { name: true, shortName: true } },
			customer: { select: { companyName: true, contactPerson: true } },
			address: { select: { line1: true, line2: true, postalCode: true, city: true } },
			_count: { select: { items: true, crew: true } }
		},
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
		prisma.asset.count({ where: { organizationId: { in: orgIds }, ...ACTIVE_ASSET_WHERE } }),
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
			where: {
				organizationId: { in: orgIds },
				...ACTIVE_ASSET_WHERE,
				nextInspectionDue: { not: null, lt: now }
			}
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
