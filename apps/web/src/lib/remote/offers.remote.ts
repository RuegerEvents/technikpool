import { query, command } from '$app/server';
import { prisma } from '$lib/server/auth';
import * as v from 'valibot';
import { dayCountBetween } from '$lib/utils';
import { isSystemAdmin, requireAuth, userOrgIds } from '$lib/server/services/access';

async function requireOrgManageAccess(orgId: string) {
	const user = await requireAuth();
	if (await isSystemAdmin(user.id)) return user;
	const membership = await prisma.orgMembership.findUnique({
		where: { userId_organizationId: { userId: user.id, organizationId: orgId } }
	});
	if (!membership || (membership.role !== 'ADMIN' && membership.role !== 'OWNER')) {
		throw new Error('Only org admins/owners can manage offers and invoices');
	}
	return user;
}

const ACTIVE_ITEM_STATUSES = ['PENDING', 'APPROVED', 'CHECKED_OUT', 'RETURNED'] as const;

// ── Offers ─────────────────────────────────────────────────────────────────

export const getOffers = query(v.optional(v.string()), async (organizationId?: string) => {
	const user = await requireAuth();
	const orgIds = organizationId ? [organizationId] : await userOrgIds(user.id);
	return prisma.offer.findMany({
		where: { organizationId: { in: orgIds } },
		include: {
			organization: { select: { name: true, shortName: true } },
			production: { select: { name: true } },
			items: true,
			invoices: { select: { id: true, number: true } }
		},
		orderBy: { createdAt: 'desc' }
	});
});

export const getOffer = query(v.string(), async (id: string) => {
	const user = await requireAuth();
	const offer = await prisma.offer.findUniqueOrThrow({
		where: { id },
		include: {
			organization: { include: { address: true } },
			production: {
				select: {
					id: true,
					name: true,
					startDate: true,
					endDate: true,
					showStartDate: true,
					showEndDate: true
				}
			},
			items: { orderBy: { createdAt: 'asc' } },
			invoices: { select: { id: true, number: true } }
		}
	});
	const orgIds = await userOrgIds(user.id);
	if (!(await isSystemAdmin(user.id)) && !orgIds.includes(offer.organizationId)) {
		throw new Error('Unauthorized');
	}
	return offer;
});

export const getOffersForProduction = query(v.string(), async (productionId: string) => {
	const user = await requireAuth();
	const production = await prisma.production.findUniqueOrThrow({
		where: { id: productionId },
		select: { organizationId: true }
	});
	const orgIds = await userOrgIds(user.id);
	if (!(await isSystemAdmin(user.id)) && !orgIds.includes(production.organizationId)) {
		throw new Error('Unauthorized');
	}
	return prisma.offer.findMany({
		where: { productionId },
		include: { items: true, invoices: { select: { id: true, number: true } } },
		orderBy: { createdAt: 'desc' }
	});
});

type BillingLine = {
	assetId: string | null;
	bundleId: string | null;
	categoryId: string;
	categoryName: string;
	categoryColor: string;
	description: string;
	netPurchasePrice: number;
	ratePercent: number;
	dailyRate: number;
};

// Recomputes what a production's currently-booked equipment would bill as,
// under a given asset scope. Used both to price a new offer/invoice and to
// detect + resync when an existing one has drifted from the production's
// current booking state. Priced per day — callers multiply by their own
// document's dayCount to get a lineTotal.
async function computeProductionBillingLines(
	productionId: string,
	assetScope: string
): Promise<BillingLine[]> {
	const production = await prisma.production.findUniqueOrThrow({
		where: { id: productionId },
		include: {
			items: {
				where: { status: { in: [...ACTIVE_ITEM_STATUSES] } },
				include: {
					asset: {
						include: {
							product: { include: { manufacturer: true, category: true } },
							bundle: { include: { template: { include: { category: true } } } }
						}
					}
				}
			}
		}
	});

	const scopedItems =
		assetScope === 'OWN_ORG_ONLY'
			? production.items.filter((item) => item.asset.organizationId === production.organizationId)
			: production.items;

	const rates = await prisma.orgCategoryRate.findMany({
		where: { organizationId: production.organizationId }
	});
	const rateByCategory = new Map(rates.map((r) => [r.categoryId, Number(r.percentage)]));

	// Assets in a bundle that has its own net purchase price are billed as a
	// single bundle line — the individual assets don't need their own price.
	const priceByBundleId = new Map(
		scopedItems
			.map((item) => item.asset.bundle)
			.filter((bundle) => bundle != null && bundle.netPurchasePrice != null)
			.map((bundle) => [bundle!.id, bundle!])
	);

	const bundledItems = scopedItems.filter(
		(item) => item.asset.bundleId && priceByBundleId.has(item.asset.bundleId)
	);
	const individualItems = scopedItems.filter(
		(item) => !item.asset.bundleId || !priceByBundleId.has(item.asset.bundleId)
	);

	const individualLines: BillingLine[] = individualItems.map((item) => {
		const asset = item.asset;
		if (asset.netPurchasePrice == null) {
			throw new Error(
				`${asset.product.name} (${asset.assetTag ?? asset.id}) has no net purchase price set — set it on the asset or its bundle before creating an offer`
			);
		}
		const ratePercent = rateByCategory.get(asset.product.categoryId);
		if (ratePercent == null) {
			throw new Error(
				`No rental rate set for category "${asset.product.category.name}" — set it in org settings first`
			);
		}
		const netPrice = Number(asset.netPurchasePrice);
		return {
			assetId: asset.id,
			bundleId: null,
			categoryId: asset.product.categoryId,
			categoryName: asset.product.category.name,
			categoryColor: asset.product.category.color,
			description: `${asset.product.manufacturer.name} ${asset.product.name}${asset.assetTag ? ` (${asset.assetTag})` : ''}`,
			netPurchasePrice: netPrice,
			ratePercent,
			dailyRate: netPrice * (ratePercent / 100)
		};
	});

	const itemsByBundleId = new Map<string, typeof bundledItems>();
	for (const item of bundledItems) {
		const bundleId = item.asset.bundleId!;
		const list = itemsByBundleId.get(bundleId);
		if (list) list.push(item);
		else itemsByBundleId.set(bundleId, [item]);
	}
	const bundleLines: BillingLine[] = [...itemsByBundleId.entries()].map(([bundleId, items]) => {
		const bundle = priceByBundleId.get(bundleId)!;
		const ratePercent = rateByCategory.get(bundle.template.categoryId);
		if (ratePercent == null) {
			throw new Error(
				`No rental rate set for category "${bundle.template.category.name}" — set it in org settings first`
			);
		}
		const netPrice = Number(bundle.netPurchasePrice);
		return {
			assetId: null,
			bundleId,
			categoryId: bundle.template.categoryId,
			categoryName: bundle.template.category.name,
			categoryColor: bundle.template.category.color,
			description: `Bundle: ${bundle.template.name} (${items.length} item${items.length !== 1 ? 's' : ''})`,
			netPurchasePrice: netPrice,
			ratePercent,
			dailyRate: netPrice * (ratePercent / 100)
		};
	});

	return [...individualLines, ...bundleLines];
}

function billingLineKey(assetId: string | null, bundleId: string | null, description: string) {
	return assetId ?? (bundleId ? `bundle:${bundleId}` : description);
}

type DiffLine = { key: string; description: string; lineTotal: number };
type ChangedLine = { key: string; description: string; before: number; after: number };
type Staleness = {
	applicable: boolean;
	stale: boolean;
	error?: string;
	added: DiffLine[];
	removed: DiffLine[];
	changed: ChangedLine[];
};

function diffBillingLines(stored: DiffLine[], current: DiffLine[]) {
	const storedByKey = new Map(stored.map((l) => [l.key, l]));
	const currentByKey = new Map(current.map((l) => [l.key, l]));

	const added: DiffLine[] = [];
	const removed: DiffLine[] = [];
	const changed: ChangedLine[] = [];

	for (const line of current) {
		const prev = storedByKey.get(line.key);
		if (!prev) {
			added.push(line);
		} else if (
			prev.description !== line.description ||
			Math.abs(prev.lineTotal - line.lineTotal) > 0.005
		) {
			changed.push({
				key: line.key,
				description: line.description,
				before: prev.lineTotal,
				after: line.lineTotal
			});
		}
	}
	for (const line of stored) {
		if (!currentByKey.has(line.key)) removed.push(line);
	}

	return { added, removed, changed };
}

const createOfferSchema = v.object({
	productionId: v.string(),
	customerId: v.optional(v.string()),
	customerName: v.string(),
	customerAddress: v.optional(v.string()),
	customerContactPerson: v.optional(v.string()),
	customerEmail: v.optional(v.string()),
	// 'OWN_ORG_ONLY' excludes assets loaned in from partner orgs — lets the
	// production owner bill their own equipment separately from partner-owned
	// equipment contributed to the same production.
	assetScope: v.optional(v.picklist(['ALL', 'OWN_ORG_ONLY']))
});

export const createOfferFromProduction = command(createOfferSchema, async (data) => {
	const production = await prisma.production.findUniqueOrThrow({
		where: { id: data.productionId },
		include: { organization: { select: { isKleinunternehmer: true } } }
	});
	await requireOrgManageAccess(production.organizationId);

	const assetScope = data.assetScope ?? 'ALL';

	// Show duration (if set) is the billable day count; total duration only
	// governs asset blocking/calendar.
	const dayCount =
		dayCountBetween(
			production.showStartDate ?? production.startDate,
			production.showEndDate ?? production.endDate
		) ?? 1;

	const lines = await computeProductionBillingLines(data.productionId, assetScope);
	const itemsData = lines.map((line) => ({
		assetId: line.assetId,
		bundleId: line.bundleId,
		categoryId: line.categoryId,
		categoryName: line.categoryName,
		categoryColor: line.categoryColor,
		description: line.description,
		netPurchasePrice: line.netPurchasePrice,
		ratePercent: line.ratePercent,
		dailyRate: line.dailyRate,
		lineTotal: line.dailyRate * dayCount
	}));

	const offer = await prisma.offer.create({
		data: {
			organizationId: production.organizationId,
			productionId: production.id,
			customerId: data.customerId || null,
			customerName: data.customerName,
			customerAddress: data.customerAddress?.trim() || null,
			customerContactPerson: data.customerContactPerson?.trim() || null,
			customerEmail: data.customerEmail?.trim() || null,
			dayCount,
			assetScope,
			vatRatePercent: production.organization.isKleinunternehmer ? 0 : 19,
			items: { create: itemsData }
		},
		include: { items: true }
	});

	await getOffers().refresh();
	return offer;
});

export const getOfferStaleness = query(v.string(), async (offerId: string) => {
	const user = await requireAuth();
	const offer = await prisma.offer.findUniqueOrThrow({
		where: { id: offerId },
		include: { items: true }
	});
	const orgIds = await userOrgIds(user.id);
	if (!(await isSystemAdmin(user.id)) && !orgIds.includes(offer.organizationId)) {
		throw new Error('Unauthorized');
	}

	if (!offer.productionId) {
		return {
			applicable: false,
			stale: false,
			added: [],
			removed: [],
			changed: []
		} satisfies Staleness;
	}

	const stored: DiffLine[] = offer.items.map((item) => ({
		key: billingLineKey(item.assetId, item.bundleId, item.description),
		description: item.description,
		lineTotal: Number(item.lineTotal)
	}));

	let lines: BillingLine[];
	try {
		lines = await computeProductionBillingLines(offer.productionId, offer.assetScope);
	} catch (err) {
		return {
			applicable: true,
			stale: false,
			error: (err as Error).message,
			added: [],
			removed: [],
			changed: []
		} satisfies Staleness;
	}

	const current: DiffLine[] = lines.map((line) => ({
		key: billingLineKey(line.assetId, line.bundleId, line.description),
		description: line.description,
		lineTotal: line.dailyRate * offer.dayCount
	}));

	const { added, removed, changed } = diffBillingLines(stored, current);
	return {
		applicable: true,
		stale: added.length > 0 || removed.length > 0 || changed.length > 0,
		added,
		removed,
		changed
	} satisfies Staleness;
});

export const updateOfferItemsFromProduction = command(v.string(), async (offerId: string) => {
	const offer = await prisma.offer.findUniqueOrThrow({ where: { id: offerId } });
	await requireOrgManageAccess(offer.organizationId);

	if (!offer.productionId) {
		throw new Error('This offer is not linked to a production');
	}

	const lines = await computeProductionBillingLines(offer.productionId, offer.assetScope);
	const itemsData = lines.map((line) => ({
		assetId: line.assetId,
		bundleId: line.bundleId,
		categoryId: line.categoryId,
		categoryName: line.categoryName,
		categoryColor: line.categoryColor,
		description: line.description,
		netPurchasePrice: line.netPurchasePrice,
		ratePercent: line.ratePercent,
		dailyRate: line.dailyRate,
		lineTotal: line.dailyRate * offer.dayCount
	}));

	await prisma.$transaction([
		prisma.offerItem.deleteMany({ where: { offerId } }),
		prisma.offer.update({ where: { id: offerId }, data: { items: { create: itemsData } } })
	]);

	await getOffer(offerId).refresh();
	await getOffers().refresh();
});

const updateOfferDayCountSchema = v.object({ offerId: v.string(), dayCount: v.number() });

export const updateOfferDayCount = command(
	updateOfferDayCountSchema,
	async ({ offerId, dayCount }) => {
		const offer = await prisma.offer.findUniqueOrThrow({
			where: { id: offerId },
			include: { items: true }
		});
		await requireOrgManageAccess(offer.organizationId);

		await prisma.$transaction([
			prisma.offer.update({ where: { id: offerId }, data: { dayCount } }),
			...offer.items.map((item) =>
				prisma.offerItem.update({
					where: { id: item.id },
					data: { lineTotal: Number(item.dailyRate) * dayCount }
				})
			)
		]);

		await getOffer(offerId).refresh();
		await getOffers().refresh();
	}
);

const updateOfferItemRateSchema = v.object({
	offerItemId: v.string(),
	ratePercent: v.number()
});

export const updateOfferItemRate = command(
	updateOfferItemRateSchema,
	async ({ offerItemId, ratePercent }) => {
		const item = await prisma.offerItem.findUniqueOrThrow({
			where: { id: offerItemId },
			include: { offer: true }
		});
		await requireOrgManageAccess(item.offer.organizationId);

		const dailyRate = Number(item.netPurchasePrice) * (ratePercent / 100);
		await prisma.offerItem.update({
			where: { id: offerItemId },
			data: { ratePercent, dailyRate, lineTotal: dailyRate * item.offer.dayCount }
		});

		await getOffer(item.offerId).refresh();
	}
);

const updateOfferDiscountSchema = v.object({
	offerId: v.string(),
	discountType: v.optional(v.picklist(['PERCENT', 'AMOUNT'])),
	discountValue: v.optional(v.number())
});

export const updateOfferDiscount = command(
	updateOfferDiscountSchema,
	async ({ offerId, discountType, discountValue }) => {
		const offer = await prisma.offer.findUniqueOrThrow({ where: { id: offerId } });
		await requireOrgManageAccess(offer.organizationId);

		await prisma.offer.update({
			where: { id: offerId },
			data: {
				discountType: discountType ?? null,
				discountValue: discountValue ?? null
			}
		});

		await getOffer(offerId).refresh();
	}
);

const updateOfferCustomerSchema = v.object({
	offerId: v.string(),
	customerId: v.optional(v.string()),
	customerName: v.string(),
	customerAddress: v.optional(v.string()),
	customerContactPerson: v.optional(v.string()),
	customerEmail: v.optional(v.string())
});

export const updateOfferCustomer = command(updateOfferCustomerSchema, async (data) => {
	const offer = await prisma.offer.findUniqueOrThrow({ where: { id: data.offerId } });
	await requireOrgManageAccess(offer.organizationId);

	await prisma.offer.update({
		where: { id: data.offerId },
		data: {
			customerId: data.customerId || null,
			customerName: data.customerName,
			customerAddress: data.customerAddress?.trim() || null,
			customerContactPerson: data.customerContactPerson?.trim() || null,
			customerEmail: data.customerEmail?.trim() || null
		}
	});

	await getOffer(data.offerId).refresh();
	await getOffers().refresh();
});

const copyOfferSchema = v.object({
	offerId: v.string(),
	customerName: v.string(),
	customerAddress: v.optional(v.string())
});

export const copyOfferToNewCustomer = command(
	copyOfferSchema,
	async ({ offerId, customerName, customerAddress }) => {
		const source = await prisma.offer.findUniqueOrThrow({
			where: { id: offerId },
			include: { items: true }
		});
		await requireOrgManageAccess(source.organizationId);

		const newOffer = await prisma.offer.create({
			data: {
				organizationId: source.organizationId,
				productionId: source.productionId,
				customerName,
				customerAddress: customerAddress?.trim() || null,
				dayCount: source.dayCount,
				discountType: source.discountType,
				discountValue: source.discountValue,
				assetScope: source.assetScope,
				vatRatePercent: source.vatRatePercent,
				items: {
					create: source.items.map((i) => ({
						assetId: i.assetId,
						bundleId: i.bundleId,
						categoryId: i.categoryId,
						categoryName: i.categoryName,
						categoryColor: i.categoryColor,
						description: i.description,
						netPurchasePrice: i.netPurchasePrice,
						ratePercent: i.ratePercent,
						dailyRate: i.dailyRate,
						lineTotal: i.lineTotal
					}))
				}
			}
		});

		await getOffers().refresh();
		return newOffer;
	}
);

export const convertOfferToInvoice = command(v.string(), async (offerId: string) => {
	const offer = await prisma.offer.findUniqueOrThrow({
		where: { id: offerId },
		include: { items: true, organization: { include: { address: true } } }
	});
	await requireOrgManageAccess(offer.organizationId);

	const year = new Date().getFullYear();
	const invoice = await prisma.$transaction(async (tx) => {
		const seq = await tx.invoiceSequence.upsert({
			where: { year },
			create: { year, lastNumber: 1 },
			update: { lastNumber: { increment: 1 } }
		});
		const number = `${year}-${String(seq.lastNumber).padStart(4, '0')}`;

		return tx.invoice.create({
			data: {
				number,
				organizationId: offer.organizationId,
				productionId: offer.productionId,
				offerId: offer.id,
				customerId: offer.customerId,
				customerName: offer.customerName,
				customerAddress: offer.customerAddress,
				customerContactPerson: offer.customerContactPerson,
				customerEmail: offer.customerEmail,
				dayCount: offer.dayCount,
				discountType: offer.discountType,
				discountValue: offer.discountValue,
				assetScope: offer.assetScope,
				isKleinunternehmerSnapshot: offer.organization.isKleinunternehmer,
				vatRatePercent: offer.organization.isKleinunternehmer ? 0 : 19,
				items: {
					create: offer.items.map((i) => ({
						assetId: i.assetId,
						bundleId: i.bundleId,
						categoryId: i.categoryId,
						categoryName: i.categoryName,
						categoryColor: i.categoryColor,
						description: i.description,
						netPurchasePrice: i.netPurchasePrice,
						ratePercent: i.ratePercent,
						dailyRate: i.dailyRate,
						lineTotal: i.lineTotal
					}))
				}
			},
			include: { items: true }
		});
	});

	await getInvoices().refresh();
	await getOffer(offerId).refresh();
	return invoice;
});

// ── Invoices ───────────────────────────────────────────────────────────────

export const getInvoices = query(v.optional(v.string()), async (organizationId?: string) => {
	const user = await requireAuth();
	const orgIds = organizationId ? [organizationId] : await userOrgIds(user.id);
	return prisma.invoice.findMany({
		where: { organizationId: { in: orgIds } },
		include: {
			organization: { select: { name: true, shortName: true } },
			production: { select: { name: true } },
			items: true
		},
		orderBy: { issueDate: 'desc' }
	});
});

export const getInvoice = query(v.string(), async (id: string) => {
	const user = await requireAuth();
	const invoice = await prisma.invoice.findUniqueOrThrow({
		where: { id },
		include: {
			organization: { include: { address: true } },
			production: {
				select: {
					id: true,
					name: true,
					startDate: true,
					endDate: true,
					showStartDate: true,
					showEndDate: true
				}
			},
			items: { orderBy: { createdAt: 'asc' } }
		}
	});
	const orgIds = await userOrgIds(user.id);
	if (!(await isSystemAdmin(user.id)) && !orgIds.includes(invoice.organizationId)) {
		throw new Error('Unauthorized');
	}
	return invoice;
});

export const getInvoicesForProduction = query(v.string(), async (productionId: string) => {
	const user = await requireAuth();
	const production = await prisma.production.findUniqueOrThrow({
		where: { id: productionId },
		select: { organizationId: true }
	});
	const orgIds = await userOrgIds(user.id);
	if (!(await isSystemAdmin(user.id)) && !orgIds.includes(production.organizationId)) {
		throw new Error('Unauthorized');
	}
	return prisma.invoice.findMany({
		where: { productionId },
		include: { items: true },
		orderBy: { issueDate: 'desc' }
	});
});

// While `sentAt` is unset, an invoice is still a draft: items can be
// resynced from the production just like an offer's. Once sent, it's a
// GoBD/§14-UStG-immutable document — no more staleness checks or updates.
export const getInvoiceStaleness = query(v.string(), async (invoiceId: string) => {
	const user = await requireAuth();
	const invoice = await prisma.invoice.findUniqueOrThrow({
		where: { id: invoiceId },
		include: { items: true }
	});
	const orgIds = await userOrgIds(user.id);
	if (!(await isSystemAdmin(user.id)) && !orgIds.includes(invoice.organizationId)) {
		throw new Error('Unauthorized');
	}

	if (invoice.sentAt || !invoice.productionId) {
		return {
			applicable: false,
			stale: false,
			added: [],
			removed: [],
			changed: []
		} satisfies Staleness;
	}

	const stored: DiffLine[] = invoice.items.map((item) => ({
		key: billingLineKey(item.assetId, item.bundleId, item.description),
		description: item.description,
		lineTotal: Number(item.lineTotal)
	}));

	let lines: BillingLine[];
	try {
		lines = await computeProductionBillingLines(invoice.productionId, invoice.assetScope);
	} catch (err) {
		return {
			applicable: true,
			stale: false,
			error: (err as Error).message,
			added: [],
			removed: [],
			changed: []
		} satisfies Staleness;
	}

	const current: DiffLine[] = lines.map((line) => ({
		key: billingLineKey(line.assetId, line.bundleId, line.description),
		description: line.description,
		lineTotal: line.dailyRate * invoice.dayCount
	}));

	const { added, removed, changed } = diffBillingLines(stored, current);
	return {
		applicable: true,
		stale: added.length > 0 || removed.length > 0 || changed.length > 0,
		added,
		removed,
		changed
	} satisfies Staleness;
});

export const updateInvoiceItemsFromProduction = command(v.string(), async (invoiceId: string) => {
	const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
	await requireOrgManageAccess(invoice.organizationId);

	if (invoice.sentAt) {
		throw new Error('This invoice has been sent and is immutable');
	}
	if (!invoice.productionId) {
		throw new Error('This invoice is not linked to a production');
	}

	const lines = await computeProductionBillingLines(invoice.productionId, invoice.assetScope);
	const itemsData = lines.map((line) => ({
		assetId: line.assetId,
		bundleId: line.bundleId,
		categoryId: line.categoryId,
		categoryName: line.categoryName,
		categoryColor: line.categoryColor,
		description: line.description,
		netPurchasePrice: line.netPurchasePrice,
		ratePercent: line.ratePercent,
		dailyRate: line.dailyRate,
		lineTotal: line.dailyRate * invoice.dayCount
	}));

	await prisma.$transaction([
		prisma.invoiceItem.deleteMany({ where: { invoiceId } }),
		prisma.invoice.update({ where: { id: invoiceId }, data: { items: { create: itemsData } } })
	]);

	await getInvoice(invoiceId).refresh();
	await getInvoices().refresh();
});

export const markInvoiceAsSent = command(v.string(), async (invoiceId: string) => {
	const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
	await requireOrgManageAccess(invoice.organizationId);

	if (invoice.sentAt) {
		throw new Error('This invoice has already been marked as sent');
	}

	await prisma.invoice.update({ where: { id: invoiceId }, data: { sentAt: new Date() } });

	await getInvoice(invoiceId).refresh();
	await getInvoices().refresh();
});

const updateInvoiceDayCountSchema = v.object({ invoiceId: v.string(), dayCount: v.number() });

export const updateInvoiceDayCount = command(
	updateInvoiceDayCountSchema,
	async ({ invoiceId, dayCount }) => {
		const invoice = await prisma.invoice.findUniqueOrThrow({
			where: { id: invoiceId },
			include: { items: true }
		});
		await requireOrgManageAccess(invoice.organizationId);
		if (invoice.sentAt) {
			throw new Error('This invoice has been sent and is immutable');
		}

		await prisma.$transaction([
			prisma.invoice.update({ where: { id: invoiceId }, data: { dayCount } }),
			...invoice.items.map((item) =>
				prisma.invoiceItem.update({
					where: { id: item.id },
					data: { lineTotal: Number(item.dailyRate) * dayCount }
				})
			)
		]);

		await getInvoice(invoiceId).refresh();
		await getInvoices().refresh();
	}
);

const updateInvoiceItemRateSchema = v.object({
	invoiceItemId: v.string(),
	ratePercent: v.number()
});

export const updateInvoiceItemRate = command(
	updateInvoiceItemRateSchema,
	async ({ invoiceItemId, ratePercent }) => {
		const item = await prisma.invoiceItem.findUniqueOrThrow({
			where: { id: invoiceItemId },
			include: { invoice: true }
		});
		await requireOrgManageAccess(item.invoice.organizationId);
		if (item.invoice.sentAt) {
			throw new Error('This invoice has been sent and is immutable');
		}

		const dailyRate = Number(item.netPurchasePrice) * (ratePercent / 100);
		await prisma.invoiceItem.update({
			where: { id: invoiceItemId },
			data: { ratePercent, dailyRate, lineTotal: dailyRate * item.invoice.dayCount }
		});

		await getInvoice(item.invoiceId).refresh();
	}
);

const updateInvoiceDiscountSchema = v.object({
	invoiceId: v.string(),
	discountType: v.optional(v.picklist(['PERCENT', 'AMOUNT'])),
	discountValue: v.optional(v.number())
});

export const updateInvoiceDiscount = command(
	updateInvoiceDiscountSchema,
	async ({ invoiceId, discountType, discountValue }) => {
		const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
		await requireOrgManageAccess(invoice.organizationId);
		if (invoice.sentAt) {
			throw new Error('This invoice has been sent and is immutable');
		}

		await prisma.invoice.update({
			where: { id: invoiceId },
			data: {
				discountType: discountType ?? null,
				discountValue: discountValue ?? null
			}
		});

		await getInvoice(invoiceId).refresh();
	}
);

const updateInvoiceCustomerSchema = v.object({
	invoiceId: v.string(),
	customerId: v.optional(v.string()),
	customerName: v.string(),
	customerAddress: v.optional(v.string()),
	customerContactPerson: v.optional(v.string()),
	customerEmail: v.optional(v.string())
});

export const updateInvoiceCustomer = command(updateInvoiceCustomerSchema, async (data) => {
	const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: data.invoiceId } });
	await requireOrgManageAccess(invoice.organizationId);
	if (invoice.sentAt) {
		throw new Error('This invoice has been sent and is immutable');
	}

	await prisma.invoice.update({
		where: { id: data.invoiceId },
		data: {
			customerId: data.customerId || null,
			customerName: data.customerName,
			customerAddress: data.customerAddress?.trim() || null,
			customerContactPerson: data.customerContactPerson?.trim() || null,
			customerEmail: data.customerEmail?.trim() || null
		}
	});

	await getInvoice(data.invoiceId).refresh();
	await getInvoices().refresh();
});
