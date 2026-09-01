import { query, command } from '$app/server';
import { error } from '@sveltejs/kit';
import { prisma } from '$lib/server/auth';
import * as v from 'valibot';
import { customerLabel, dayCountBetween, formatAddress, getErrorMessage } from '$lib/utils';
import { isSystemAdmin, requireAuth, userOrgIds } from '$lib/server/services/access';
import {
	DEFAULT_INVOICE_CLOSING,
	DEFAULT_INVOICE_INTRO,
	DEFAULT_OFFER_CLOSING,
	DEFAULT_OFFER_INTRO,
	formatBillingDate,
	renderBillingText
} from '$lib/billing-text';
import { generateBillingPdf, organizationFromSnapshot } from '$lib/server/billing-pdf';
import { putObject } from '$lib/server/storage';
import { orgSnapshotColumns } from '$lib/org-snapshot';

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

/**
 * Offers are numbered automatically, per org and year ("A-2026-0007") —
 * unlike invoices, whose numbers are typed in by hand because orgs follow
 * their own external schemes there. Must run inside the transaction that
 * creates the offer, so a failed create doesn't burn a number… which would be
 * harmless, but confusing.
 */
async function nextOfferNumber(
	tx: Pick<typeof prisma, 'offerSequence'>,
	organizationId: string
): Promise<string> {
	const year = new Date().getFullYear();
	const seq = await tx.offerSequence.upsert({
		where: { organizationId_year: { organizationId, year } },
		create: { organizationId, year, lastNumber: 1 },
		update: { lastNumber: { increment: 1 } }
	});
	return `A-${year}-${String(seq.lastNumber).padStart(4, '0')}`;
}

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
			organization: { include: { address: true, categoryRates: true } },
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
	// Null for bundle lines, which already collapse to one line by themselves.
	productId: string | null;
	// The description without the per-unit tag — the label a collapsed
	// "3 × …" line carries.
	productLabel: string;
	categoryId: string;
	categoryName: string;
	categoryNameDe: string | null;
	categoryColor: string;
	description: string;
	netPurchasePrice: number;
	ratePercent: number;
	dailyRate: number;
};

// Equipment that is booked but can't be priced yet. One entry per product,
// because the price is per (billing org, product): filling it in covers every
// unit of that product in this org's billing, here and in every later offer.
type MissingPrice = {
	key: string;
	productId: string;
	label: string;
	categoryName: string;
	categoryNameDe: string | null;
	categoryColor: string;
	// Which orgs the booked units belong to — informational, since a product is
	// shared catalog data rather than any one org's.
	organizationNames: string[];
	assets: {
		id: string;
		assetTag: string | null;
		label: string;
		// Set when the unit sits in a bundle that has no price of its own —
		// pricing that bundle is the other way to resolve the same blocker.
		bundleId: string | null;
		bundleName: string | null;
	}[];
};

type MissingRate = { categoryId: string; categoryName: string; categoryNameDe: string | null };

type ProductionBilling = {
	lines: BillingLine[];
	missingPrices: MissingPrice[];
	missingRates: MissingRate[];
};

function assetLabel(asset: {
	assetTag: string | null;
	serialNumber: string | null;
	id: string;
}): string {
	return asset.assetTag ?? asset.serialNumber ?? asset.id;
}

function summarizeContents(labels: string[]): string {
	const counts = new Map<string, number>();
	for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
	const collator = new Intl.Collator('de', { numeric: true, sensitivity: 'base' });
	return [...counts]
		.sort(([a], [b]) => collator.compare(a, b))
		.map(([label, count]) => (count > 1 ? `${count}× ${label}` : label))
		.join(', ');
}

function productBillingLabel(product: {
	name: string;
	manufacturer: { name: string; generic: boolean };
}): string {
	return product.manufacturer.generic
		? product.name
		: `${product.manufacturer.name} ${product.name}`;
}

// Recomputes what a production's currently-booked equipment would bill as,
// under a given asset scope. Used both to price a new offer/invoice and to
// detect + resync when an existing one has drifted from the production's
// current booking state. Priced per day — callers multiply by their own
// document's dayCount to get a lineTotal.
//
// Everything that *can* be priced is priced; equipment that can't is reported
// in `missingPrices` / `missingRates` rather than aborting the whole
// computation, so the offer form can list every blocker at once and offer to
// fix it. `computeProductionBillingLines` is the wrapper that insists on a
// complete result.
async function computeProductionBilling(
	productionId: string,
	assetScope: string
): Promise<ProductionBilling> {
	const production = await prisma.production.findUniqueOrThrow({
		where: { id: productionId },
		include: {
			items: {
				where: { status: { in: [...ACTIVE_ITEM_STATUSES] } },
				include: {
					asset: {
						include: {
							organization: { select: { id: true, name: true } },
							product: { include: { manufacturer: true, category: true } },
							accessories: {
								include: { product: { include: { manufacturer: true } } },
								orderBy: { id: 'asc' }
							},
							bundle: {
								include: {
									template: {
										include: { category: true, organization: { select: { id: true, name: true } } }
									}
								}
							}
						}
					}
				}
			}
		}
	});

	const inScopeItems =
		assetScope === 'OWN_ORG_ONLY'
			? production.items.filter((item) => item.asset.organizationId === production.organizationId)
			: production.items;

	// An accessory is booked because its parent was, and the parent's price is
	// the price of what ships attached to it — a converter's PSU is not a second
	// line, and its missing product price is not a blocker. Derived from live
	// state, not a stored flag, for the same reason `billedAsBundle` below is:
	// detaching it makes it bill as itself again from that moment on. An
	// accessory whose parent is *not* in this billing scope (a cross-org parent
	// under OWN_ORG_ONLY) does bill as itself — nothing else covers it.
	const parentIdsInScope = new Set(inScopeItems.map((item) => item.assetId));
	const scopedItems = inScopeItems.filter(
		(item) => item.asset.parentAssetId === null || !parentIdsInScope.has(item.asset.parentAssetId)
	);

	const rates = await prisma.orgCategoryRate.findMany({
		where: { organizationId: production.organizationId }
	});
	const rateByCategory = new Map(rates.map((r) => [r.categoryId, Number(r.percentage)]));

	// Prices are per-org, and it is always the *billing* org's price that
	// counts — including for equipment loaned in from a partner org: what the
	// partner paid for the device is their bookkeeping, not this org's tariff.
	const orgPrices = await prisma.orgProductPrice.findMany({
		where: { organizationId: production.organizationId }
	});
	const priceByProduct = new Map(orgPrices.map((p) => [p.productId, Number(p.netPurchasePrice)]));

	const missingPrices: MissingPrice[] = [];
	const missingRates = new Map<string, MissingRate>();

	// Assets booked *through* a bundle that has its own net purchase price are
	// billed as a single bundle line — the individual assets don't need their
	// own price. Booking source, not bundle membership: a unit picked
	// individually bills as itself, because a kit price can't be charged for a
	// kit that didn't ship. A unit that has left its bundle since it was booked
	// bills individually for the same reason.
	const billedAsBundle = (item: (typeof scopedItems)[number]) =>
		item.sourceBundleId !== null &&
		item.asset.bundleId === item.sourceBundleId &&
		item.asset.bundle?.netPurchasePrice != null
			? item.asset.bundle
			: null;

	const priceByBundleId = new Map(
		scopedItems
			.map(billedAsBundle)
			.filter((bundle) => bundle != null)
			.map((bundle) => [bundle!.id, bundle!])
	);

	const bundledItems = scopedItems.filter((item) => billedAsBundle(item) !== null);
	const individualItems = scopedItems.filter((item) => billedAsBundle(item) === null);

	const individualLines: BillingLine[] = [];
	const unpricedByProduct = new Map<string, MissingPrice>();

	for (const item of individualItems) {
		const asset = item.asset;
		const ratePercent = rateByCategory.get(asset.product.categoryId);
		if (ratePercent == null) {
			missingRates.set(asset.product.categoryId, {
				categoryId: asset.product.categoryId,
				categoryName: asset.product.category.name,
				categoryNameDe: asset.product.category.nameDe
			});
		}
		if (priceByProduct.get(asset.productId) == null) {
			const key = `product:${asset.productId}`;
			let group = unpricedByProduct.get(key);
			if (!group) {
				group = {
					key,
					productId: asset.productId,
					label: `${asset.product.manufacturer.name} ${asset.product.name}`,
					categoryName: asset.product.category.name,
					categoryNameDe: asset.product.category.nameDe,
					categoryColor: asset.product.category.color,
					organizationNames: [],
					assets: []
				};
				unpricedByProduct.set(key, group);
				missingPrices.push(group);
			}
			if (!group.organizationNames.includes(asset.organization.name)) {
				group.organizationNames.push(asset.organization.name);
			}
			group.assets.push({
				id: asset.id,
				assetTag: asset.assetTag,
				label: assetLabel(asset),
				bundleId: asset.bundle?.id ?? null,
				bundleName: asset.bundle
					? `${asset.bundle.template.name}${asset.bundle.tag ? ` (${asset.bundle.tag})` : ''}`
					: null
			});
			continue;
		}
		if (ratePercent == null) continue;

		const netPrice = priceByProduct.get(asset.productId)!;
		const productLabel = productBillingLabel(asset.product);
		const accessoryLabels = asset.accessories.map((accessory) =>
			productBillingLabel(accessory.product)
		);
		const baseDescription = `${productLabel}${asset.assetTag ? ` (${asset.assetTag})` : ''}`;
		individualLines.push({
			assetId: asset.id,
			bundleId: null,
			productId: asset.productId,
			productLabel,
			categoryId: asset.product.categoryId,
			categoryName: asset.product.category.name,
			categoryNameDe: asset.product.category.nameDe,
			categoryColor: asset.product.category.color,
			description:
				accessoryLabels.length > 0
					? `${baseDescription}\ninkl. ${summarizeContents(accessoryLabels)}`
					: baseDescription,
			netPurchasePrice: netPrice,
			ratePercent,
			dailyRate: netPrice * (ratePercent / 100)
		});
	}

	const itemsByBundleId = new Map<string, typeof bundledItems>();
	for (const item of bundledItems) {
		const bundleId = item.sourceBundleId!;
		const list = itemsByBundleId.get(bundleId);
		if (list) list.push(item);
		else itemsByBundleId.set(bundleId, [item]);
	}
	const bundleLines: BillingLine[] = [];
	for (const [bundleId, items] of itemsByBundleId) {
		const bundle = priceByBundleId.get(bundleId)!;
		const ratePercent = rateByCategory.get(bundle.template.categoryId);
		if (ratePercent == null) {
			missingRates.set(bundle.template.categoryId, {
				categoryId: bundle.template.categoryId,
				categoryName: bundle.template.category.name,
				categoryNameDe: bundle.template.category.nameDe
			});
			continue;
		}
		const netPrice = Number(bundle.netPurchasePrice);
		const contentLabels = items.flatMap((item) => [
			productBillingLabel(item.asset.product),
			...item.asset.accessories.map((accessory) => productBillingLabel(accessory.product))
		]);
		bundleLines.push({
			assetId: null,
			bundleId,
			productId: null,
			productLabel: bundle.template.name,
			categoryId: bundle.template.categoryId,
			categoryName: bundle.template.category.name,
			categoryNameDe: bundle.template.category.nameDe,
			categoryColor: bundle.template.category.color,
			description: `${bundle.template.name}\nbestehend aus: ${summarizeContents(contentLabels)}`,
			netPurchasePrice: netPrice,
			ratePercent,
			dailyRate: netPrice * (ratePercent / 100)
		});
	}

	return {
		lines: [...individualLines, ...bundleLines],
		missingPrices,
		missingRates: [...missingRates.values()]
	};
}

function billingBlockerMessage(missingPrices: MissingPrice[], missingRates: MissingRate[]): string {
	const parts: string[] = [];
	if (missingPrices.length > 0) {
		const named = missingPrices.map((m) => `${m.label} (${m.assets.length}×)`).join(', ');
		parts.push(`No net purchase price set for: ${named}`);
	}
	if (missingRates.length > 0) {
		parts.push(
			`No rental rate set for category: ${missingRates.map((r) => r.categoryName).join(', ')}`
		);
	}
	return parts.join('. ');
}

async function computeProductionBillingLines(
	productionId: string,
	assetScope: string
): Promise<BillingLine[]> {
	const { lines, missingPrices, missingRates } = await computeProductionBilling(
		productionId,
		assetScope
	);
	if (missingPrices.length > 0 || missingRates.length > 0) {
		error(400, billingBlockerMessage(missingPrices, missingRates));
	}
	return lines;
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
		} else if (Math.abs(prev.lineTotal - line.lineTotal) > 0.005) {
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

const billingReadinessSchema = v.object({
	productionId: v.string(),
	assetScope: v.optional(v.picklist(['ALL', 'OWN_ORG_ONLY']))
});

// What the offer form asks before it lets anyone press "Create": which booked
// equipment still can't be priced, and whether this user is the one who can
// fix it. Without this the first unpriced asset only surfaces as a failed
// creation, with no way to act on it from where the user is standing.
export const getProductionBillingReadiness = query(
	billingReadinessSchema,
	async ({ productionId, assetScope }) => {
		const user = await requireAuth();
		const production = await prisma.production.findUniqueOrThrow({
			where: { id: productionId },
			select: { organizationId: true }
		});
		const systemAdmin = await isSystemAdmin(user.id);
		if (!systemAdmin && !(await userOrgIds(user.id)).includes(production.organizationId)) {
			error(403, 'Unauthorized');
		}

		const { lines, missingPrices, missingRates } = await computeProductionBilling(
			productionId,
			assetScope ?? 'ALL'
		);

		const manageableOrgIds = new Set(
			systemAdmin
				? []
				: (
						await prisma.orgMembership.findMany({
							where: { userId: user.id, role: { in: ['ADMIN', 'OWNER'] } },
							select: { organizationId: true }
						})
					).map((m) => m.organizationId)
		);
		const canManage = (orgId: string) => systemAdmin || manageableOrgIds.has(orgId);

		return {
			organizationId: production.organizationId,
			pricedLineCount: lines.length,
			pricedDailyTotal: lines.reduce((sum, line) => sum + line.dailyRate, 0),
			// Both the price and the rate belong to the org doing the billing —
			// prices are per (org, product), so only this org's admins set them.
			canEditPrices: canManage(production.organizationId),
			missingPrices,
			missingRates,
			canEditRates: canManage(production.organizationId)
		};
	}
);

const createOfferSchema = v.object({
	productionId: v.string(),
	customerId: v.optional(v.string()),
	customerName: v.string(),
	customerAddress: v.optional(v.string()),
	customerContactPerson: v.optional(v.string()),
	customerEmail: v.optional(v.string()),
	introText: v.optional(v.string()),
	closingText: v.optional(v.string()),
	// 'OWN_ORG_ONLY' excludes assets loaned in from partner orgs — lets the
	// production owner bill their own equipment separately from partner-owned
	// equipment contributed to the same production.
	assetScope: v.optional(v.picklist(['ALL', 'OWN_ORG_ONLY']))
});

export const createOfferFromProduction = command(createOfferSchema, async (data) => {
	const production = await prisma.production.findUniqueOrThrow({
		where: { id: data.productionId },
		include: { organization: { include: { address: true } } }
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
	const serviceStartDate = production.showStartDate ?? production.startDate ?? new Date();
	const serviceEndDate = production.showEndDate ?? production.endDate ?? serviceStartDate;
	const customer = data.customerId
		? await prisma.customer.findFirst({
				where: { id: data.customerId, organizationId: production.organizationId }
			})
		: null;
	const variables = {
		production: production.name,
		startDate: formatBillingDate(serviceStartDate),
		endDate: formatBillingDate(serviceEndDate),
		servicePeriod: `${formatBillingDate(serviceStartDate)} bis ${formatBillingDate(serviceEndDate)}`,
		customer: data.customerName,
		paymentTermsDays: production.organization.paymentTermsDays
	};
	const itemsData = lines.map((line) => ({
		assetId: line.assetId,
		bundleId: line.bundleId,
		productId: line.productId,
		productLabel: line.productLabel,
		categoryId: line.categoryId,
		categoryName: line.categoryName,
		categoryNameDe: line.categoryNameDe,
		categoryColor: line.categoryColor,
		description: line.description,
		netPurchasePrice: line.netPurchasePrice,
		ratePercent: line.ratePercent,
		dailyRate: line.dailyRate,
		lineTotal: line.dailyRate * dayCount
	}));

	const offer = await prisma.$transaction(async (tx) => {
		return tx.offer.create({
			data: {
				number: await nextOfferNumber(tx, production.organizationId),
				...orgSnapshotColumns(production.organization),
				organizationId: production.organizationId,
				productionId: production.id,
				customerId: data.customerId || null,
				customerName: data.customerName,
				customerAddress: data.customerAddress?.trim() || null,
				customerContactPerson: data.customerContactPerson?.trim() || null,
				customerEmail: data.customerEmail?.trim() || null,
				customerNumber: customer?.customerNumber ?? null,
				customerPhone: customer?.phone ?? null,
				customerVatId: customer?.vatId ?? null,
				serviceStartDate,
				serviceEndDate,
				introText:
					data.introText?.trim() ||
					renderBillingText(
						production.organization.offerIntroTemplate || DEFAULT_OFFER_INTRO,
						variables
					),
				closingText:
					data.closingText?.trim() ||
					renderBillingText(
						production.organization.offerClosingTemplate || DEFAULT_OFFER_CLOSING,
						variables
					),
				paymentTermsDays: production.organization.paymentTermsDays,
				dayCount,
				assetScope,
				vatRatePercent: production.organization.isKleinunternehmer ? 0 : 19,
				items: { create: itemsData }
			},
			include: { items: true }
		});
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
	if (offer.finalizedAt) {
		return {
			applicable: false,
			stale: false,
			added: [],
			removed: [],
			changed: []
		} satisfies Staleness;
	}

	const storedByKey = new Map(
		offer.items.map((item) => [billingLineKey(item.assetId, item.bundleId, item.description), item])
	);
	const stored: DiffLine[] = offer.items.map((item) => ({
		key: billingLineKey(item.assetId, item.bundleId, item.description),
		description: item.productLabel ?? item.description.split('\n', 1)[0],
		lineTotal: Number(item.lineTotal)
	}));

	let lines: BillingLine[];
	try {
		lines = await computeProductionBillingLines(offer.productionId, offer.assetScope);
	} catch (err) {
		return {
			applicable: true,
			stale: false,
			error: getErrorMessage(err),
			added: [],
			removed: [],
			changed: []
		} satisfies Staleness;
	}

	const current: DiffLine[] = lines.map((line) => {
		const key = billingLineKey(line.assetId, line.bundleId, line.description);
		const storedItem = storedByKey.get(key);
		// A line-level rate is an intentional document override, not a change to
		// the production. Reprice the live catalog value with that stored rate so
		// catalog price changes still surface without category defaults making a
		// manually edited offer appear stale.
		const ratePercent = storedItem ? Number(storedItem.ratePercent) : line.ratePercent;
		return {
			key,
			description: line.productLabel,
			lineTotal: line.netPurchasePrice * (ratePercent / 100) * offer.dayCount
		};
	});

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
	if (offer.finalizedAt) throw new Error('This offer is finalized and immutable');

	if (!offer.productionId) {
		throw new Error('This offer is not linked to a production');
	}

	const lines = await computeProductionBillingLines(offer.productionId, offer.assetScope);
	const itemsData = lines.map((line) => ({
		assetId: line.assetId,
		bundleId: line.bundleId,
		productId: line.productId,
		productLabel: line.productLabel,
		categoryId: line.categoryId,
		categoryName: line.categoryName,
		categoryNameDe: line.categoryNameDe,
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
		if (offer.finalizedAt) throw new Error('This offer is finalized and immutable');

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

// Takes a list because the document shows units of one product as a single
// line: editing that line's rate has to move every unit behind it, or the
// collapsed line would show a rate none of its units actually has.
const updateOfferItemRateSchema = v.object({
	offerItemIds: v.pipe(v.array(v.string()), v.minLength(1)),
	ratePercent: v.number()
});

export const updateOfferItemRate = command(
	updateOfferItemRateSchema,
	async ({ offerItemIds, ratePercent }) => {
		const items = await prisma.offerItem.findMany({
			where: { id: { in: offerItemIds } },
			include: { offer: true }
		});
		if (items.length === 0) error(404, 'No offer lines found');
		const offerIds = [...new Set(items.map((i) => i.offerId))];
		if (offerIds.length > 1) error(400, 'Lines belong to different offers');
		await requireOrgManageAccess(items[0].offer.organizationId);
		if (items[0].offer.finalizedAt) throw new Error('This offer is finalized and immutable');

		await prisma.$transaction(
			items.map((item) => {
				const dailyRate = Number(item.netPurchasePrice) * (ratePercent / 100);
				return prisma.offerItem.update({
					where: { id: item.id },
					data: { ratePercent, dailyRate, lineTotal: dailyRate * item.offer.dayCount }
				});
			})
		);

		// Return the committed document so the caller can replace its active
		// query value directly. A refresh alone can update only the cache while an
		// already-rendered remote-query value remains one edit behind.
		return await getOffer(offerIds[0]);
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
		if (offer.finalizedAt) throw new Error('This offer is finalized and immutable');

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
	if (offer.finalizedAt) throw new Error('This offer is finalized and immutable');
	const customer = data.customerId
		? await prisma.customer.findFirst({
				where: { id: data.customerId, organizationId: offer.organizationId }
			})
		: null;

	await prisma.offer.update({
		where: { id: data.offerId },
		data: {
			customerId: data.customerId || null,
			customerName: data.customerName,
			customerAddress: data.customerAddress?.trim() || null,
			customerContactPerson: data.customerContactPerson?.trim() || null,
			customerEmail: data.customerEmail?.trim() || null,
			customerNumber: customer?.customerNumber ?? null,
			customerPhone: customer?.phone ?? null,
			customerVatId: customer?.vatId ?? null
		}
	});

	await getOffer(data.offerId).refresh();
	await getOffers().refresh();
});

const copyOfferSchema = v.object({
	offerId: v.string(),
	customerId: v.string()
});

export const copyOfferToNewCustomer = command(copyOfferSchema, async ({ offerId, customerId }) => {
	const source = await prisma.offer.findUniqueOrThrow({
		where: { id: offerId },
		include: { items: true, organization: { include: { address: true } } }
	});
	await requireOrgManageAccess(source.organizationId);

	// The copy goes to a real customer record, scoped to the same org —
	// its details become the new document's snapshot.
	const customer = await prisma.customer.findFirst({
		where: { id: customerId, organizationId: source.organizationId },
		include: { address: true }
	});
	if (!customer) throw new Error('Customer not found');

	const newOffer = await prisma.$transaction(async (tx) => {
		return tx.offer.create({
			data: {
				// A copy is a new document issued now: it gets its own number and a
				// fresh snapshot of the org's current letterhead, not the source's.
				number: await nextOfferNumber(tx, source.organizationId),
				...orgSnapshotColumns(source.organization),
				isKleinunternehmerSnapshot: source.isKleinunternehmerSnapshot,
				organizationId: source.organizationId,
				productionId: source.productionId,
				customerId: customer.id,
				customerName: customerLabel(customer),
				customerAddress: formatAddress(customer.address) || null,
				customerContactPerson: customer.contactPerson,
				customerEmail: customer.email,
				customerNumber: customer.customerNumber,
				customerPhone: customer.phone,
				customerVatId: customer.vatId,
				serviceStartDate: source.serviceStartDate,
				serviceEndDate: source.serviceEndDate,
				introText: source.introText,
				closingText: source.closingText,
				paymentTermsDays: source.paymentTermsDays,
				dayCount: source.dayCount,
				discountType: source.discountType,
				discountValue: source.discountValue,
				assetScope: source.assetScope,
				vatRatePercent: source.vatRatePercent,
				items: {
					create: source.items.map((i) => ({
						assetId: i.assetId,
						bundleId: i.bundleId,
						productId: i.productId,
						productLabel: i.productLabel,
						categoryId: i.categoryId,
						categoryName: i.categoryName,
						categoryNameDe: i.categoryNameDe,
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
	});

	await getOffers().refresh();
	return newOffer;
});

export const deleteOffer = command(v.string(), async (offerId: string) => {
	const offer = await prisma.offer.findUniqueOrThrow({
		where: { id: offerId },
		include: { _count: { select: { invoices: true } } }
	});
	await requireOrgManageAccess(offer.organizationId);
	if (offer._count.invoices > 0) throw new Error('An invoice was created from this offer');
	// A finalized offer is an issued commercial letter with an archived PDF —
	// GoBD retention applies to it just as to an invoice, so it cannot be
	// deleted (deleting a finalized offer would also shred that archive).
	if (offer.finalizedAt) throw new Error('A finalized offer cannot be deleted');
	await prisma.offer.delete({ where: { id: offerId } });
	await getOffers().refresh();
});

export const finalizeOffer = command(v.string(), async (offerId: string) => {
	const offer = await prisma.offer.findUniqueOrThrow({
		where: { id: offerId },
		include: { items: { orderBy: { createdAt: 'asc' } } }
	});
	await requireOrgManageAccess(offer.organizationId);
	if (offer.finalizedAt) throw new Error('This offer has already been finalized');
	const pdfPath = `billing-documents/${offer.organizationId}/offers/${offer.id}.pdf`;
	// The PDF renders from the offer's own org snapshot, never the live org —
	// what is archived is what the document said, not what the org looks like
	// on the day someone pressed the button.
	const pdf = await generateBillingPdf('offer', {
		...offer,
		organization: organizationFromSnapshot(offer)
	});
	await putObject(pdfPath, pdf, 'application/pdf');
	// Conditional on still being a draft, so two concurrent finalizes can't
	// both pass the check above and each archive their own PDF.
	const { count } = await prisma.offer.updateMany({
		where: { id: offerId, finalizedAt: null },
		data: { finalizedAt: new Date(), pdfPath }
	});
	if (count === 0) throw new Error('This offer has already been finalized');
	await getOffer(offerId).refresh();
	await getOffers().refresh();
});

const convertOfferSchema = v.object({
	offerId: v.string(),
	// Assigned by hand — each org runs its own external numbering scheme, so
	// the app checks uniqueness within the org rather than inventing numbers.
	number: v.pipe(v.string(), v.trim(), v.minLength(1))
});

export const convertOfferToInvoice = command(convertOfferSchema, async ({ offerId, number }) => {
	const offer = await prisma.offer.findUniqueOrThrow({
		where: { id: offerId },
		// The invoice's lines are created in the order they are read here, and an
		// invoice whose lines are shuffled against the offer it was converted from
		// is the one document where that is not a cosmetic difference.
		include: {
			items: { orderBy: { createdAt: 'asc' } },
			organization: { include: { address: true } }
		}
	});
	await requireOrgManageAccess(offer.organizationId);
	if (!offer.finalizedAt || !offer.pdfPath)
		throw new Error('Finalize the offer before creating an invoice');

	const clash = await prisma.invoice.findUnique({
		where: { organizationId_number: { organizationId: offer.organizationId, number } },
		select: { id: true }
	});
	if (clash) error(409, `Invoice number "${number}" is already taken in this organisation`);

	const invoice = await prisma.$transaction(async (tx) => {
		return tx.invoice.create({
			data: {
				number,
				// The invoice is a new document issued now, so it snapshots the
				// org's *current* letterhead — the offer may be weeks old.
				...orgSnapshotColumns(offer.organization),
				organizationId: offer.organizationId,
				productionId: offer.productionId,
				offerId: offer.id,
				customerId: offer.customerId,
				customerName: offer.customerName,
				customerAddress: offer.customerAddress,
				customerContactPerson: offer.customerContactPerson,
				customerEmail: offer.customerEmail,
				customerNumber: offer.customerNumber,
				customerPhone: offer.customerPhone,
				customerVatId: offer.customerVatId,
				serviceStartDate: offer.serviceStartDate,
				serviceEndDate: offer.serviceEndDate,
				introText: renderBillingText(
					offer.organization.invoiceIntroTemplate || DEFAULT_INVOICE_INTRO,
					{
						production: offer.productionId
							? ((
									await tx.production.findUnique({
										where: { id: offer.productionId },
										select: { name: true }
									})
								)?.name ?? '')
							: '',
						startDate: offer.serviceStartDate ? formatBillingDate(offer.serviceStartDate) : '',
						endDate: offer.serviceEndDate ? formatBillingDate(offer.serviceEndDate) : '',
						servicePeriod:
							offer.serviceStartDate && offer.serviceEndDate
								? `${formatBillingDate(offer.serviceStartDate)} bis ${formatBillingDate(offer.serviceEndDate)}`
								: '',
						customer: offer.customerName,
						documentNumber: number,
						paymentTermsDays: offer.paymentTermsDays
					}
				),
				closingText: renderBillingText(
					offer.organization.invoiceClosingTemplate || DEFAULT_INVOICE_CLOSING,
					{
						production: '',
						startDate: '',
						endDate: '',
						servicePeriod: '',
						customer: offer.customerName,
						documentNumber: number,
						paymentTermsDays: offer.paymentTermsDays
					}
				),
				paymentTermsDays: offer.paymentTermsDays,
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
						productId: i.productId,
						productLabel: i.productLabel,
						categoryId: i.categoryId,
						categoryName: i.categoryName,
						categoryNameDe: i.categoryNameDe,
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
		productId: line.productId,
		productLabel: line.productLabel,
		categoryId: line.categoryId,
		categoryName: line.categoryName,
		categoryNameDe: line.categoryNameDe,
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

export const finalizeInvoice = command(v.string(), async (invoiceId: string) => {
	const invoice = await prisma.invoice.findUniqueOrThrow({
		where: { id: invoiceId },
		include: { items: { orderBy: { createdAt: 'asc' } } }
	});
	await requireOrgManageAccess(invoice.organizationId);

	if (invoice.pdfPath) {
		throw new Error('This invoice has already been finalized');
	}
	const pdfPath = `billing-documents/${invoice.organizationId}/invoices/${invoice.id}.pdf`;
	// Renders from the invoice's own org snapshot — see finalizeOffer.
	const pdf = await generateBillingPdf('invoice', {
		...invoice,
		organization: organizationFromSnapshot(invoice)
	});
	await putObject(pdfPath, pdf, 'application/pdf');
	// Conditional on not being archived yet, so two concurrent finalizes can't
	// both slip past the check above.
	const { count } = await prisma.invoice.updateMany({
		where: { id: invoiceId, pdfPath: null },
		data: { sentAt: invoice.sentAt ?? new Date(), pdfPath }
	});
	if (count === 0) throw new Error('This invoice has already been finalized');

	await getInvoice(invoiceId).refresh();
	await getInvoices().refresh();
});

const updateInvoiceNumberSchema = v.object({
	invoiceId: v.string(),
	number: v.pipe(v.string(), v.trim(), v.minLength(1))
});

// The number is entered by hand at creation, so a typo needs a way out — but
// only while the invoice is still a draft.
export const updateInvoiceNumber = command(
	updateInvoiceNumberSchema,
	async ({ invoiceId, number }) => {
		const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
		await requireOrgManageAccess(invoice.organizationId);
		if (invoice.sentAt) throw new Error('This invoice has been sent and is immutable');
		const clash = await prisma.invoice.findUnique({
			where: { organizationId_number: { organizationId: invoice.organizationId, number } },
			select: { id: true }
		});
		if (clash && clash.id !== invoiceId)
			error(409, `Invoice number "${number}" is already taken in this organisation`);

		await prisma.invoice.update({ where: { id: invoiceId }, data: { number } });
		await getInvoice(invoiceId).refresh();
		await getInvoices().refresh();
	}
);

const updateDocumentOrgSnapshotSchema = v.object({
	id: v.string(),
	kind: v.picklist(['offer', 'invoice'])
});

// Pull the org's *current* letterhead into a draft document. The snapshot
// never follows the org on its own — this is the explicit flow behind the
// "org details have changed" hint, and it stops working the moment the
// document is finalized.
export const updateDocumentOrgSnapshot = command(updateDocumentOrgSnapshotSchema, async (data) => {
	if (data.kind === 'offer') {
		const offer = await prisma.offer.findUniqueOrThrow({
			where: { id: data.id },
			include: { organization: { include: { address: true } } }
		});
		await requireOrgManageAccess(offer.organizationId);
		if (offer.finalizedAt) throw new Error('This offer is finalized and immutable');
		const snapshot = orgSnapshotColumns(offer.organization);
		await prisma.offer.update({
			where: { id: data.id },
			data: {
				...snapshot,
				// The VAT rate follows the Kleinunternehmer status it snapshots.
				vatRatePercent: snapshot.isKleinunternehmerSnapshot ? 0 : 19
			}
		});
		await getOffer(data.id).refresh();
	} else {
		const invoice = await prisma.invoice.findUniqueOrThrow({
			where: { id: data.id },
			include: { organization: { include: { address: true } } }
		});
		await requireOrgManageAccess(invoice.organizationId);
		if (invoice.sentAt) throw new Error('This invoice has been sent and is immutable');
		const snapshot = orgSnapshotColumns(invoice.organization);
		await prisma.invoice.update({
			where: { id: data.id },
			data: {
				...snapshot,
				vatRatePercent: snapshot.isKleinunternehmerSnapshot ? 0 : 19
			}
		});
		await getInvoice(data.id).refresh();
	}
});

export const deleteInvoice = command(v.string(), async (invoiceId: string) => {
	const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
	await requireOrgManageAccess(invoice.organizationId);
	if (invoice.sentAt) throw new Error('A finalized invoice cannot be deleted');
	await prisma.invoice.delete({ where: { id: invoiceId } });
	await getInvoices().refresh();
	if (invoice.offerId) await getOffer(invoice.offerId).refresh();
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

// A list, for the same reason as updateOfferItemRate.
const updateInvoiceItemRateSchema = v.object({
	invoiceItemIds: v.pipe(v.array(v.string()), v.minLength(1)),
	ratePercent: v.number()
});

export const updateInvoiceItemRate = command(
	updateInvoiceItemRateSchema,
	async ({ invoiceItemIds, ratePercent }) => {
		const items = await prisma.invoiceItem.findMany({
			where: { id: { in: invoiceItemIds } },
			include: { invoice: true }
		});
		if (items.length === 0) error(404, 'No invoice lines found');
		const invoiceIds = [...new Set(items.map((i) => i.invoiceId))];
		if (invoiceIds.length > 1) error(400, 'Lines belong to different invoices');
		await requireOrgManageAccess(items[0].invoice.organizationId);
		if (items[0].invoice.sentAt) {
			throw new Error('This invoice has been sent and is immutable');
		}

		await prisma.$transaction(
			items.map((item) => {
				const dailyRate = Number(item.netPurchasePrice) * (ratePercent / 100);
				return prisma.invoiceItem.update({
					where: { id: item.id },
					data: { ratePercent, dailyRate, lineTotal: dailyRate * item.invoice.dayCount }
				});
			})
		);

		await getInvoice(invoiceIds[0]).refresh();
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
	const customer = data.customerId
		? await prisma.customer.findFirst({
				where: { id: data.customerId, organizationId: invoice.organizationId }
			})
		: null;

	await prisma.invoice.update({
		where: { id: data.invoiceId },
		data: {
			customerId: data.customerId || null,
			customerName: data.customerName,
			customerAddress: data.customerAddress?.trim() || null,
			customerContactPerson: data.customerContactPerson?.trim() || null,
			customerEmail: data.customerEmail?.trim() || null,
			customerNumber: customer?.customerNumber ?? null,
			customerPhone: customer?.phone ?? null,
			customerVatId: customer?.vatId ?? null
		}
	});

	await getInvoice(data.invoiceId).refresh();
	await getInvoices().refresh();
});

const updateDocumentTextSchema = v.object({
	id: v.string(),
	kind: v.picklist(['offer', 'invoice']),
	introText: v.optional(v.string()),
	closingText: v.optional(v.string()),
	paymentTermsDays: v.number()
});

export const updateDocumentText = command(updateDocumentTextSchema, async (data) => {
	if (data.kind === 'offer') {
		const offer = await prisma.offer.findUniqueOrThrow({ where: { id: data.id } });
		await requireOrgManageAccess(offer.organizationId);
		if (offer.finalizedAt) throw new Error('This offer is finalized and immutable');
		await prisma.offer.update({
			where: { id: data.id },
			data: {
				introText: data.introText?.trim() || null,
				closingText: data.closingText?.trim() || null,
				paymentTermsDays: data.paymentTermsDays
			}
		});
		await getOffer(data.id).refresh();
	} else {
		const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: data.id } });
		await requireOrgManageAccess(invoice.organizationId);
		if (invoice.sentAt) throw new Error('This invoice has been sent and is immutable');
		await prisma.invoice.update({
			where: { id: data.id },
			data: {
				introText: data.introText?.trim() || null,
				closingText: data.closingText?.trim() || null,
				paymentTermsDays: data.paymentTermsDays
			}
		});
		await getInvoice(data.id).refresh();
	}
});
