import { query, command } from '$app/server';
import { prisma8, newId } from '$lib/server/auth';
import { and } from '@prisma/orm-postgres/orm-client';
import { dated, must, toTimestamp, now } from '$lib/server/prisma8';
import { sendMail } from '$lib/server/mail';
import { appBaseUrl } from '$lib/server/app-url';
import { pendingApprovalEmail } from '$lib/server/emails/pending-approval';
import { bookingReviewedEmail } from '$lib/server/emails/booking-reviewed';
import { addedAsCrewEmail } from '$lib/server/emails/added-as-crew';
import * as v from 'valibot';
import { requireAuth } from '$lib/server/services/access';
import { RETIRED_ASSET_STATUSES, isRetiredStatus } from '$lib/asset-status';
import { accessoryIdsOf } from '$lib/server/services/accessories';

// Statuses that still hold a booking. Anything else has left the production.
const BLOCKING_STATUSES = ['PENDING', 'APPROVED', 'CHECKED_OUT'];
const RETIRED = [...RETIRED_ASSET_STATUSES] as string[];

// Prisma 8's `orderBy` takes fields of the model being queried, so it cannot
// sort by a joined column the way `{ asset: { product: { name: 'asc' } } }`
// did. The item lists this file returns are one production's worth, so the
// ordering happens here instead.
//
// This database sorts text in C collation — code-point order, so "CAT6A"
// comes before "Cable" — even though it reports en_US.utf8. `Intl.Collator`
// would order it linguistically and put those two the other way round, which
// is a packing list that reshuffles between two prints of it. Comparing with
// `<` reproduces what Postgres was doing.
const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Ascending, with nulls last — what `{ sort: 'asc', nulls: 'last' }` meant. */
function compareNullsLast(a: string | null, b: string | null) {
	if (a === b) return 0;
	if (a === null) return 1;
	if (b === null) return -1;
	return compareText(a, b);
}

// Returns which of `ownerOrgIds` do NOT currently have any PENDING item in
// this production — i.e. the orgs for which a new PENDING item would be the
// first one, and thus warrants a notification email. Must be called BEFORE
// creating the new items.
async function getOrgIdsNeedingApprovalNotification(productionId: string, ownerOrgIds: string[]) {
	if (ownerOrgIds.length === 0) return [];
	// Asked of Asset rather than ProductionItem because the org id lives on the
	// asset: the ORM exposes a relation as a filter, not as a column to select
	// through, so starting here keeps `organizationId` a plain projection.
	const alreadyPending = await prisma8.orm.public.Asset.where((a) =>
		a.organizationId.in(ownerOrgIds)
	)
		.where((a) =>
			a.productionItems.some((i) => and(i.productionId.eq(productionId), i.status.eq('PENDING')))
		)
		.select('organizationId')
		.all();
	const alreadyPendingOrgIds = new Set(alreadyPending.map((a) => a.organizationId));
	return ownerOrgIds.filter((id) => !alreadyPendingOrgIds.has(id));
}

/** How many items in this production are still awaiting this org's approval. */
async function countPendingForOwner(productionId: string, ownerOrgId: string) {
	const { pending } = await prisma8.orm.public.ProductionItem.where({
		productionId,
		status: 'PENDING'
	})
		.where((i) => i.asset.some((a) => a.organizationId.eq(ownerOrgId)))
		.aggregate((a) => ({ pending: a.count() }));
	return pending;
}

/** The OWNER/ADMIN members of an org, with the addresses to write to. */
async function orgApprovers(organizationId: string) {
	return await prisma8.orm.public.OrgMembership.where({ organizationId })
		.where((m) => m.role.in(['OWNER', 'ADMIN']))
		.include('user', (u) => u.select('email', 'name'))
		.all();
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
					countPendingForOwner(productionId, ownerOrgId),
					prisma8.orm.public.Organization.select('name').first({ id: ownerOrgId }),
					orgApprovers(ownerOrgId)
				]);

				await Promise.all(
					recipients.map((membership) => {
						const { subject, html, text } = pendingApprovalEmail({
							name: membership.user.name,
							ownerOrgName: must(org, 'Organization').name,
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
		const remainingPending = await countPendingForOwner(productionId, ownerOrgId);
		if (remainingPending > 0) return;

		const [production, ownerOrg, recipients] = await Promise.all([
			prisma8.orm.public.Production.select('name').first({ id: productionId }),
			prisma8.orm.public.Organization.select('name').first({ id: ownerOrgId }),
			orgApprovers(requestingOrgId)
		]);

		await Promise.all(
			recipients.map((membership) => {
				const { subject, html, text } = bookingReviewedEmail({
					name: membership.user.name,
					ownerOrgName: must(ownerOrg, 'Organization').name,
					productionName: must(production, 'Production').name,
					url: `${appBaseUrl}/productions/${productionId}`
				});
				return sendMail({ to: membership.user.email, subject, html, text });
			})
		);
	} catch (err) {
		console.error(`Failed to send booking-reviewed email for production ${productionId}:`, err);
	}
}

/** The org ids the signed-in user belongs to. */
async function myOrgIds(userId: string) {
	const memberships = await prisma8.orm.public.OrgMembership.where({ userId })
		.select('organizationId')
		.all();
	return memberships.map((m) => m.organizationId);
}

/** One membership row, or null when the user does not belong to the org. */
async function membershipOf(userId: string, organizationId: string) {
	return await prisma8.orm.public.OrgMembership.where({ userId, organizationId }).first();
}

export const getProductions = query(v.optional(v.string()), async (organizationId?: string) => {
	const user = await requireAuth();
	const orgIds = organizationId ? [organizationId] : await myOrgIds(user.id);
	return dated(
		await prisma8.orm.public.Production.where((p) => p.organizationId.in(orgIds))
			.include('organization', (o) => o.select('name', 'shortName'))
			.include('items', (i) => i.include('asset', (a) => a.include('product')))
			.orderBy((p) => p.startDate.asc())
			.all()
	);
});

export const getProduction = query(v.string(), async (id: string) => {
	await requireAuth();
	const production = dated(
		must(
			await prisma8.orm.public.Production.include('items', (i) =>
				i
					.include('asset', (a) =>
						a
							.include('product', (p) => p.include('manufacturer'))
							.include('organization')
							.include('accessories', (acc) => acc.select('id'))
					)
					.include('sourceBundle', (b) =>
						b.select('id').include('template', (t) => t.select('name'))
					)
			)
				.include('address')
				.include('customer', (c) => c.include('address'))
				.include('crew', (c) =>
					c
						.include('user', (u) => u.select('id', 'name', 'email'))
						.orderBy((m) => m.createdAt.asc())
				)
				.include('organization')
				.first({ id }),
			'Production'
		)
	);

	// The page groups these into sections in the order it meets them, and the
	// print routes walk them as they come — so an unordered list is a packing
	// list whose sections move between two prints of it. Same order as every
	// other list of units: product, then tag.
	production.items.sort(
		(a, b) =>
			compareText(a.asset.product.name, b.asset.product.name) ||
			compareNullsLast(a.asset.assetTag, b.asset.assetTag) ||
			compareText(a.assetId, b.assetId)
	);

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

/** The production with the relations the address/customer editors render. */
async function productionWithAddress(id: string) {
	return dated(
		must(
			await prisma8.orm.public.Production.include('address')
				.include('customer', (c) => c.include('address'))
				.include('organization')
				.first({ id }),
			'Production'
		)
	);
}

export const createProduction = command(createProductionSchema, async (data) => {
	const user = await requireAuth();

	const membership = await membershipOf(user.id, data.organizationId);
	if (!membership) throw new Error('Not a member');

	const startDate = data.startDate ? new Date(data.startDate) : null;
	const endDate = data.endDate ? new Date(data.endDate) : null;
	const showStartDate = data.showStartDate ? new Date(data.showStartDate) : null;
	const showEndDate = data.showEndDate ? new Date(data.showEndDate) : null;
	validateDuration({ startDate, endDate, showStartDate, showEndDate });

	const hasAnyAddress =
		!!data.address &&
		Object.values(data.address).some((v) => (typeof v === 'string' ? v.trim().length > 0 : false));

	const productionId = await prisma8.transaction(async (tx) => {
		const address = hasAnyAddress
			? await tx.orm.public.Address.create({
					id: newId('Address'),
					line1: data.address!.line1.trim(),
					line2: data.address?.line2?.trim() || null,
					postalCode: data.address!.postalCode.trim(),
					city: data.address!.city.trim(),
					updatedAt: now()
				})
			: null;

		const created = await tx.orm.public.Production.create({
			id: newId('Production'),
			name: data.name,
			organizationId: data.organizationId,
			startDate: toTimestamp(startDate),
			endDate: toTimestamp(endDate),
			showStartDate: toTimestamp(showStartDate),
			showEndDate: toTimestamp(showEndDate),
			addressId: address?.id ?? null,
			customerId: data.customerId || null,
			updatedAt: now()
		});
		return created.id;
	});

	const production = await productionWithAddress(productionId);

	await getProductions(data.organizationId).refresh();
	await getProductions().refresh();
	return production;
});

export const deleteProduction = command(v.string(), async (productionId: string) => {
	const user = await requireAuth();
	const production = must(
		await prisma8.orm.public.Production.select('id', 'name', 'organizationId', 'addressId').first({
			id: productionId
		}),
		'Production'
	);
	const membership = await membershipOf(user.id, production.organizationId);
	if (!membership || (membership.role !== 'OWNER' && membership.role !== 'ADMIN')) {
		throw new Error('Only organization admins and owners can delete productions');
	}

	await prisma8.transaction(async (tx) => {
		await tx.orm.public.Production.where({ id: productionId }).delete();
		// Production addresses are created as private records. Remove the orphan
		// only when nothing else has since been linked to it.
		const addressId = production.addressId;
		if (addressId) {
			const references = await Promise.all([
				tx.orm.public.Organization.where({ addressId }).aggregate((a) => ({ n: a.count() })),
				tx.orm.public.Location.where({ addressId }).aggregate((a) => ({ n: a.count() })),
				tx.orm.public.Customer.where({ addressId }).aggregate((a) => ({ n: a.count() })),
				tx.orm.public.Production.where({ addressId }).aggregate((a) => ({ n: a.count() }))
			]);
			if (references.every(({ n }) => n === 0)) {
				await tx.orm.public.Address.where({ id: addressId }).delete();
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
	const user = await requireAuth();

	const production = must(
		await prisma8.orm.public.Production.select('id', 'organizationId', 'addressId').first({
			id: input.productionId
		}),
		'Production'
	);

	const membership = await membershipOf(user.id, production.organizationId);
	if (!membership) throw new Error('Not a member');

	const hasAny = Object.values(input.address).some((v) => (v?.trim()?.length ?? 0) > 0);

	await prisma8.transaction(async (tx) => {
		if (!hasAny) {
			await tx.orm.public.Production.where({ id: input.productionId }).update({ addressId: null });
			return;
		}

		const fields = {
			line1: input.address.line1.trim(),
			line2: input.address.line2?.trim() || null,
			postalCode: input.address.postalCode.trim(),
			city: input.address.city.trim()
		};

		const addressId = production.addressId
			? must(
					await tx.orm.public.Address.where({ id: production.addressId }).update({
						...fields,
						updatedAt: now()
					}),
					'Address'
				).id
			: (await tx.orm.public.Address.create({ id: newId('Address'), ...fields, updatedAt: now() }))
					.id;

		await tx.orm.public.Production.where({ id: input.productionId }).update({ addressId });
	});

	const updated = await productionWithAddress(input.productionId);

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

	const production = must(
		await prisma8.orm.public.Production.select('id', 'organizationId').first({
			id: input.productionId
		}),
		'Production'
	);

	const membership = await membershipOf(user.id, production.organizationId);
	if (!membership) throw new Error('Not a member');

	const startDate = input.startDate ? new Date(input.startDate) : null;
	const endDate = input.endDate ? new Date(input.endDate) : null;
	const showStartDate = input.showStartDate ? new Date(input.showStartDate) : null;
	const showEndDate = input.showEndDate ? new Date(input.showEndDate) : null;
	validateDuration({ startDate, endDate, showStartDate, showEndDate });

	const updated = dated(
		must(
			await prisma8.orm.public.Production.where({ id: input.productionId }).update({
				startDate: toTimestamp(startDate),
				endDate: toTimestamp(endDate),
				showStartDate: toTimestamp(showStartDate),
				showEndDate: toTimestamp(showEndDate)
			}),
			'Production'
		)
	);

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

	const production = must(
		await prisma8.orm.public.Production.select('id', 'organizationId').first({
			id: input.productionId
		}),
		'Production'
	);

	const membership = await membershipOf(user.id, production.organizationId);
	if (!membership) throw new Error('Not a member');

	await prisma8.orm.public.Production.where({ id: input.productionId }).update({
		customerId: input.customerId || null
	});
	const updated = await productionWithAddress(input.productionId);

	await getProduction(input.productionId).refresh();
	return updated;
});

const addAssetSchema = v.object({
	productionId: v.string(),
	assetId: v.string()
});

/**
 * Items of other productions that overlap this one and still hold their asset.
 * `assetIds` empty means "any asset".
 */
async function findOverlappingBookings(
	productionId: string,
	start: Date,
	end: Date,
	assetIds?: string[]
) {
	let items = prisma8.orm.public.ProductionItem.where((i) => i.productionId.neq(productionId))
		.where((i) => i.status.in(BLOCKING_STATUSES))
		.where((i) =>
			i.production.some((p) =>
				and(
					p.startDate.isNotNull(),
					p.endDate.isNotNull(),
					p.startDate.lte(toTimestamp(end)),
					p.endDate.gte(toTimestamp(start))
				)
			)
		);
	if (assetIds) items = items.where((i) => i.assetId.in(assetIds));
	return await items
		.select('assetId')
		.include('production', (p) => p.select('name'))
		.all();
}

export const addAssetToProduction = command(addAssetSchema, async (data) => {
	const user = await requireAuth();

	const production = dated(
		must(
			await prisma8.orm.public.Production.include('organization', (o) =>
				o.select('id', 'name', 'shortName')
			).first({ id: data.productionId }),
			'Production'
		)
	);
	const asset = must(await prisma8.orm.public.Asset.first({ id: data.assetId }), 'Asset');
	if (isRetiredStatus(asset.status)) {
		throw new Error('This asset is sold or decommissioned and can no longer be booked');
	}

	if (production.startDate && production.endDate) {
		const [conflict] = await findOverlappingBookings(
			data.productionId,
			production.startDate,
			production.endDate,
			[data.assetId]
		);
		if (conflict) {
			throw new Error(`Asset is already booked for "${conflict.production.name}" during this time`);
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

	const item = await prisma8.orm.public.ProductionItem.create({
		id: newId('ProductionItem'),
		productionId: data.productionId,
		assetId: data.assetId,
		status: initialStatus,
		sourceBundleId: null,
		sourceParentAssetId: null
	});
	if (accessoryIds.length > 0) {
		// `createAll` has no skipDuplicates, so the already-booked ones are
		// filtered out here rather than swallowed by the insert.
		const alreadyBooked = new Set(
			(
				await prisma8.orm.public.ProductionItem.where({ productionId: data.productionId })
					.where((i) => i.assetId.in(accessoryIds))
					.select('assetId')
					.all()
			).map((i) => i.assetId)
		);
		const toBook = accessoryIds.filter((id) => !alreadyBooked.has(id));
		if (toBook.length > 0) {
			await prisma8.orm.public.ProductionItem.createAll(
				toBook.map((assetId) => ({
					id: newId('ProductionItem'),
					productionId: data.productionId,
					assetId,
					sourceBundleId: null,
					sourceParentAssetId: data.assetId,
					status: initialStatus
				}))
			);
		}
	}

	await prisma8.orm.public.AssetTransaction.create({
		id: newId('AssetTransaction'),
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

/** Approve or decline one cross-org request, and tell the requester when the queue empties. */
async function reviewProductionItem(itemId: string, decision: 'APPROVED' | 'DECLINED') {
	const user = await requireAuth();

	const item = must(
		await prisma8.orm.public.ProductionItem.include('asset')
			.include('production')
			.first({ id: itemId }),
		'ProductionItem'
	);

	const membership = await membershipOf(user.id, item.asset.organizationId);
	if (!membership || (membership.role !== 'ADMIN' && membership.role !== 'OWNER')) {
		throw new Error(
			decision === 'APPROVED'
				? 'Unauthorized to approve assets from this org'
				: 'Unauthorized to decline assets from this org'
		);
	}

	const updated = must(
		await prisma8.orm.public.ProductionItem.where({ id: itemId }).update({ status: decision }),
		'ProductionItem'
	);

	await prisma8.orm.public.AssetTransaction.create({
		id: newId('AssetTransaction'),
		assetId: item.assetId,
		userId: user.id,
		productionId: item.productionId,
		action: decision,
		data: {
			type: decision,
			productionId: item.productionId,
			productionName: item.production.name
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
}

export const approveProductionItem = command(v.string(), (itemId: string) =>
	reviewProductionItem(itemId, 'APPROVED')
);

export const declineProductionItem = command(v.string(), (itemId: string) =>
	reviewProductionItem(itemId, 'DECLINED')
);

export const getPendingApprovals = query(v.string(), async (organizationId: string) => {
	const user = await requireAuth();

	const membership = await membershipOf(user.id, organizationId);
	if (!membership || (membership.role !== 'ADMIN' && membership.role !== 'OWNER')) {
		throw new Error('Unauthorized');
	}

	return dated(
		await prisma8.orm.public.ProductionItem.where({ status: 'PENDING' })
			.where((i) => i.asset.some((a) => a.organizationId.eq(organizationId)))
			.include('asset', (a) => a.include('product'))
			.include('production', (p) => p.include('organization'))
			.all()
	);
});

// ── Bundles in productions ────────────────────────────────────────────────────

const addBundleSchema = v.object({
	productionId: v.string(),
	bundleId: v.string()
});

export const addBundleToProduction = command(addBundleSchema, async (data) => {
	const user = await requireAuth();

	const production = dated(
		must(
			await prisma8.orm.public.Production.include('organization', (o) => o.select('name')).first({
				id: data.productionId
			}),
			'Production'
		)
	);
	const bundle = must(
		await prisma8.orm.public.AssetBundle.include('assets').first({ id: data.bundleId }),
		'AssetBundle'
	);

	const existingItems = await prisma8.orm.public.ProductionItem.where({
		productionId: data.productionId
	})
		.select('id', 'assetId', 'sourceBundleId')
		.all();
	const existingAssetIds = new Set(existingItems.map((i) => i.assetId));

	if (bundle.assets.length === 0) throw new Error('Bundle has no assets');

	// Units of this bundle that are already booked here on their own — putting
	// booked assets into a bundle and then adding that bundle is the ordinary
	// way to arrive at this. The bundle adopts them instead of leaving the same
	// unit listed both individually and under the bundle.
	const bundleAssetIds = new Set(bundle.assets.map((a) => a.id));
	const adoptable = existingItems.filter(
		(i) => bundleAssetIds.has(i.assetId) && i.sourceBundleId === null
	);

	let newAssets = bundle.assets.filter(
		(a) => !existingAssetIds.has(a.id) && !isRetiredStatus(a.status)
	);
	if (newAssets.length === 0 && adoptable.length === 0) {
		throw new Error('All bundle assets are already in this production');
	}

	let skippedConflicts = 0;
	if (production.startDate && production.endDate && newAssets.length > 0) {
		const conflictingItems = await findOverlappingBookings(
			data.productionId,
			production.startDate,
			production.endDate,
			newAssets.map((a) => a.id)
		);
		const conflictIds = new Set(conflictingItems.map((i) => i.assetId));
		skippedConflicts = conflictIds.size;
		newAssets = newAssets.filter((a) => !conflictIds.has(a.id));
	}

	if (newAssets.length === 0 && adoptable.length === 0)
		throw new Error('All bundle assets are already booked during this production');

	const crossOrgIds = [
		...new Set(
			newAssets
				.filter((a) => a.organizationId !== production.organizationId)
				.map((a) => a.organizationId)
		)
	];
	const orgsToNotify = await getOrgIdsNeedingApprovalNotification(data.productionId, crossOrgIds);

	await prisma8.transaction(async (tx) => {
		if (newAssets.length > 0) {
			await tx.orm.public.ProductionItem.createAll(
				newAssets.map((asset) => ({
					id: newId('ProductionItem'),
					productionId: data.productionId,
					assetId: asset.id,
					sourceBundleId: data.bundleId,
					sourceParentAssetId: asset.parentAssetId,
					status: production.organizationId !== asset.organizationId ? 'PENDING' : 'APPROVED'
				}))
			);
		}
		// Adoption only moves which row a unit is listed under; its approval
		// status was already settled when it was booked.
		if (adoptable.length > 0) {
			await tx.orm.public.ProductionItem.where((i) =>
				i.id.in(adoptable.map((a) => a.id))
			).updateAndCount({ sourceBundleId: data.bundleId });
		}
	});

	if (newAssets.length > 0) {
		await prisma8.orm.public.AssetTransaction.createAll(
			newAssets.map((asset) => ({
				id: newId('AssetTransaction'),
				assetId: asset.id,
				userId: user.id,
				productionId: data.productionId,
				action: 'ADDED_TO_PRODUCTION',
				data: {
					productionId: data.productionId,
					productionName: production.name
				}
			}))
		);
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
	return { added: newAssets.length, adopted: adoptable.length, skippedConflicts };
});

export const removeProductionItem = command(v.string(), async (itemId: string) => {
	await requireAuth();
	const item = must(
		await prisma8.orm.public.ProductionItem.where({ id: itemId }).delete(),
		'ProductionItem'
	);
	// The accessories were booked because the parent was; they go with it.
	await prisma8.orm.public.ProductionItem.where({
		productionId: item.productionId,
		sourceParentAssetId: item.assetId
	}).deleteAndCount();
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
		await requireAuth();
		const parentItem = must(
			await prisma8.orm.public.ProductionItem.where({ productionId, assetId }).first(),
			'ProductionItem'
		);
		const currentAccessories = await prisma8.orm.public.Asset.where({ parentAssetId: assetId })
			.select('id')
			.all();
		const bookedAccessories = await prisma8.orm.public.ProductionItem.where({
			productionId,
			sourceParentAssetId: assetId
		}).all();
		const currentIds = new Set(currentAccessories.map((asset) => asset.id));
		const bookedIds = new Set(bookedAccessories.map((item) => item.assetId));
		const toRemove = bookedAccessories.filter((item) => !currentIds.has(item.assetId));
		const toAdd = currentAccessories.filter((asset) => !bookedIds.has(asset.id));

		// Anything already in this production under a different parent would have
		// been a skipDuplicates no-op before; `createAll` has no such option.
		const alreadyInProduction = new Set(
			(
				await prisma8.orm.public.ProductionItem.where({ productionId })
					.where((i) => i.assetId.in(toAdd.map((a) => a.id)))
					.select('assetId')
					.all()
			).map((i) => i.assetId)
		);
		const insertable = toAdd.filter((asset) => !alreadyInProduction.has(asset.id));

		await prisma8.transaction(async (tx) => {
			if (toRemove.length > 0) {
				await tx.orm.public.ProductionItem.where((i) =>
					i.id.in(toRemove.map((item) => item.id))
				).deleteAndCount();
			}
			if (insertable.length > 0) {
				await tx.orm.public.ProductionItem.createAll(
					insertable.map((asset) => ({
						id: newId('ProductionItem'),
						productionId,
						assetId: asset.id,
						sourceBundleId: parentItem.sourceBundleId,
						sourceParentAssetId: assetId,
						status: parentItem.status
					}))
				);
			}
		});
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
		await requireAuth();
		await prisma8.orm.public.ProductionItem.where({
			productionId: data.productionId,
			sourceBundleId: data.bundleId
		}).deleteAndCount();
		await getProduction(data.productionId).refresh();
	}
);

const syncBundleSchema = v.object({
	productionId: v.string(),
	bundleId: v.string()
});

export const syncBundleInProduction = command(syncBundleSchema, async (data) => {
	const user = await requireAuth();

	const production = dated(
		must(
			await prisma8.orm.public.Production.include('organization', (o) =>
				o.select('id', 'name')
			).first({ id: data.productionId }),
			'Production'
		)
	);
	const bundle = must(
		await prisma8.orm.public.AssetBundle.include('assets').first({ id: data.bundleId }),
		'AssetBundle'
	);

	const currentItems = await prisma8.orm.public.ProductionItem.where({
		productionId: data.productionId,
		sourceBundleId: data.bundleId
	}).all();

	const currentItemAssetIds = new Set(currentItems.map((i) => i.assetId));
	const bundleAssetIds = new Set(bundle.assets.map((a) => a.id));

	const toRemove = currentItems.filter((i) => !bundleAssetIds.has(i.assetId));

	const allProductionItems = await prisma8.orm.public.ProductionItem.where({
		productionId: data.productionId
	})
		.select('id', 'assetId', 'sourceBundleId')
		.all();
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
	if (production.startDate && production.endDate && toAdd.length > 0) {
		const conflictingItems = await findOverlappingBookings(
			data.productionId,
			production.startDate,
			production.endDate,
			toAdd.map((a) => a.id)
		);
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

	await prisma8.transaction(async (tx) => {
		if (toRemove.length > 0) {
			await tx.orm.public.ProductionItem.where((i) =>
				i.id.in(toRemove.map((item) => item.id))
			).deleteAndCount();
		}
		if (toAdd.length > 0) {
			await tx.orm.public.ProductionItem.createAll(
				toAdd.map((asset) => ({
					id: newId('ProductionItem'),
					productionId: data.productionId,
					assetId: asset.id,
					sourceBundleId: data.bundleId,
					sourceParentAssetId: asset.parentAssetId,
					status: production.organizationId !== asset.organizationId ? 'PENDING' : 'APPROVED'
				}))
			);
		}
		if (adoptable.length > 0) {
			await tx.orm.public.ProductionItem.where((i) =>
				i.id.in(adoptable.map((a) => a.id))
			).updateAndCount({ sourceBundleId: data.bundleId });
		}
	});

	if (toAdd.length > 0) {
		await prisma8.orm.public.AssetTransaction.createAll(
			toAdd.map((asset) => ({
				id: newId('AssetTransaction'),
				assetId: asset.id,
				userId: user.id,
				productionId: data.productionId,
				action: 'ADDED_TO_PRODUCTION',
				data: { productionId: data.productionId, productionName: production.name }
			}))
		);
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
	await requireAuth();
	const created = await prisma8.orm.public.ProductionCrew.create({
		id: newId('ProductionCrew'),
		productionId: data.productionId,
		userId: data.userId,
		role: data.role ?? null
	});
	const member = dated(
		must(
			await prisma8.orm.public.ProductionCrew.include('user', (u) =>
				u.select('id', 'name', 'email')
			).first({ id: created.id }),
			'ProductionCrew'
		)
	);

	const production = dated(
		must(
			await prisma8.orm.public.Production.select('name', 'startDate', 'endDate').first({
				id: data.productionId
			}),
			'Production'
		)
	);

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
	const member = dated(
		must(await prisma8.orm.public.ProductionCrew.where({ id }).delete(), 'ProductionCrew')
	);
	await getProduction(member.productionId).refresh();
	return member;
});

export const getBookedAssets = query(
	v.string(),
	async (productionId: string): Promise<{ assetId: string; productionName: string }[]> => {
		await requireAuth();
		const production = dated(
			must(
				await prisma8.orm.public.Production.select('startDate', 'endDate').first({
					id: productionId
				}),
				'Production'
			)
		);
		if (!production.startDate || !production.endDate) return [];
		const items = await findOverlappingBookings(
			productionId,
			production.startDate,
			production.endDate
		);
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
	const orgIds = await myOrgIds(user.id);

	// An accessory's availability is its parent's — it is booked and returned
	// with it, so a row per power cable is noise on a calendar.
	return dated(
		await prisma8.orm.public.Asset.where((a) => a.organizationId.in(orgIds))
			.where((a) => a.parentAssetId.isNull())
			.where((a) => a.status.notIn(RETIRED))
			.include('product', (p) => p.include('manufacturer'))
			.include('organization')
			.include('bundle', (b) => b.select('id').include('template', (t) => t.select('name')))
			.include('productionItems', (pi) =>
				pi
					.where((i) => i.status.in(['APPROVED', 'CHECKED_OUT', 'PENDING']))
					.where((i) =>
						i.production.some((p) => and(p.startDate.isNotNull(), p.endDate.isNotNull()))
					)
					.include('production')
			)
			.all()
	);
});

export const getProductionsCalendar = query(async () => {
	const user = await requireAuth();
	const orgIds = await myOrgIds(user.id);
	return dated(
		await prisma8.orm.public.Production.where((p) => p.organizationId.in(orgIds))
			.where((p) => p.startDate.isNotNull())
			.where((p) => p.endDate.isNotNull())
			.include('organization', (o) => o.select('name', 'shortName'))
			.orderBy((p) => p.startDate.asc())
			.all()
	);
});

export const getDashboardStats = query(async () => {
	const user = await requireAuth();
	const orgIds = await myOrgIds(user.id);
	const today = new Date();

	const myAssets = () => prisma8.orm.public.Asset.where((a) => a.organizationId.in(orgIds));

	const [
		totalAssets,
		availableAssets,
		maintenanceAssets,
		brokenAssets,
		upcoming,
		bundles,
		overdueInspections
	] = await Promise.all([
		myAssets()
			.where((a) => a.status.notIn(RETIRED))
			.aggregate((a) => ({ n: a.count() })),
		myAssets()
			.where({ status: 'AVAILABLE' })
			.aggregate((a) => ({ n: a.count() })),
		myAssets()
			.where({ status: 'MAINTENANCE' })
			.aggregate((a) => ({ n: a.count() })),
		myAssets()
			.where({ status: 'BROKEN' })
			.aggregate((a) => ({ n: a.count() })),
		prisma8.orm.public.Production.where((p) => p.organizationId.in(orgIds))
			.where((p) => p.startDate.gte(toTimestamp(today)))
			.include('organization', (o) => o.select('name', 'shortName'))
			// `_count` has no Prisma 8 equivalent; a reducer on the relation is the
			// same query, and the shape is rebuilt below so the dashboard is unchanged.
			.include('items', (i) => i.count())
			.include('crew', (c) => c.count())
			.select('id', 'name', 'startDate', 'endDate')
			.orderBy((p) => p.startDate.asc())
			.limit(5)
			.all(),
		prisma8.orm.public.AssetBundle.where((b) =>
			b.template.some((t) => t.organizationId.in(orgIds))
		).aggregate((a) => ({ n: a.count() })),
		myAssets()
			.where((a) => a.status.notIn(RETIRED))
			.where((a) => a.nextInspectionDue.isNotNull())
			.where((a) => a.nextInspectionDue.lt(toTimestamp(today)))
			.aggregate((a) => ({ n: a.count() }))
	]);

	const upcomingProductions = dated(upcoming).map(({ items, crew, ...production }) => ({
		...production,
		_count: { items, crew }
	}));

	return {
		totalAssets: totalAssets.n,
		assetsByStatus: {
			available: availableAssets.n,
			maintenance: maintenanceAssets.n,
			broken: brokenAssets.n
		},
		upcomingProductions,
		bundleCount: bundles.n,
		overdueInspections: overdueInspections.n
	};
});
