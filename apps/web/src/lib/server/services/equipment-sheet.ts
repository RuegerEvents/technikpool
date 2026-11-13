import { error } from '@sveltejs/kit';
import type { Prisma } from '#lib/prisma/client.js';
import { naturalCompare } from '#lib/sort.js';
import { prisma } from '#lib/server/auth.js';
import { summarizeContents } from '#lib/billing-lines.js';
import { productLabel, withCaption } from '#lib/product-label.js';
import { inBookedKit } from '#lib/bundle-nesting.js';
import { customerRecipient, orgLabel } from '#lib/utils.js';
import { ACTIVE_ASSET_WHERE, BOOKABLE_ASSET_WHERE } from '#lib/asset-status.js';
import { ROLE_FOR } from '#lib/roles.js';
import { compareGroups, groupKey, type ListGroup } from '#lib/production-list.js';
import {
	assetImageIsStale,
	bundleImageIsStale,
	ensureAssetImage,
	ensureBundleImage
} from '#lib/server/services/bundle-image.js';
import {
	requireOrgInventory,
	requireOrgRole,
	requireProductionRead
} from '#lib/server/services/access.js';
import { fmtDate } from '../pdf-text';
import { productionRentalTerms } from './rental-terms';
import { rentalTermsNote } from '#lib/rental-terms-text.js';
import type { OrgListLayout, SheetKind } from '#lib/equipment-sheet.js';
import {
	generateEquipmentSheetPdf,
	type EquipmentSheet,
	type EquipmentSheetGroup,
	type EquipmentSheetLine,
	type ReportProgress
} from '../equipment-sheet-pdf';

const ORG_INCLUDE = { address: true } as const;

/** What a sheet needs to know about a kit: its picture, type and location. */
const BUNDLE_INCLUDE = {
	location: { select: { name: true } },
	template: {
		include: { category: true, featuredProducts: { select: { id: true } } }
	},
	assets: {
		select: {
			parentAssetId: true,
			product: { select: { id: true, imagePath: true } }
		}
	}
} satisfies Prisma.AssetBundleInclude;

/** What a sheet needs to know about a unit: its picture, kit and accessories. */
const ASSET_INCLUDE = {
	product: { include: { manufacturer: true, category: true } },
	inspectionSchedules: {
		select: {
			nextDue: true,
			type: { select: { id: true, name: true, nameDe: true, sortOrder: true } }
		}
	},
	accessories: { include: { product: true } },
	location: { select: { name: true } },
	organization: { select: { name: true, shortName: true } },
	// A unit of a kit inside another one is listed on the outer kit's line
	// when it was booked through it, under the inner kit's name.
	bundle: {
		include: { ...BUNDLE_INCLUDE, parentBundle: { include: BUNDLE_INCLUDE } }
	}
} satisfies Prisma.AssetInclude;

async function loadProduction(productionId: string, statuses: string[]) {
	return prisma.production.findUniqueOrThrow({
		where: { id: productionId },
		include: {
			organization: { include: ORG_INCLUDE },
			address: true,
			customer: { include: { address: true } },
			items: {
				where: { status: { in: statuses } },
				include: {
					asset: { include: ASSET_INCLUDE }
				},
				// Same order as the production page, so two prints of one sheet agree.
				orderBy: [
					{ asset: { product: { name: 'asc' } } },
					{ asset: { assetTag: { sort: 'asc', nulls: 'last' } } },
					{ assetId: 'asc' }
				]
			}
		}
	});
}

type Production = Awaited<ReturnType<typeof loadProduction>>;
/**
 * A unit as a sheet lists it: a production's item, or an org's asset. A unit
 * belongs to a kit's line while it is still in the kit it came with
 * (`sourceBundleId`) — on a production that is how it was booked, in an
 * org's list the kit it is in.
 */
type Unit = {
	assetId: string;
	sourceBundleId: string | null;
	asset: Prisma.AssetGetPayload<{ include: typeof ASSET_INCLUDE }>;
};
type Bundle = Prisma.AssetBundleGetPayload<{ include: typeof BUNDLE_INCLUDE }>;
type Org = Production['organization'];

function categoryName(category: { name: string; nameDe: string | null }) {
	return category.nameDe?.trim() || category.name;
}

/** MM/YYYY, the precision a "valid until" on paper needs. */
function monthYear(date: Date) {
	return `${String(date.getUTCMonth() + 1).padStart(2, '0')}/${date.getUTCFullYear()}`;
}

/**
 * Per inspection type the line's units are tracked for, the earliest due date
 * among them — what the whole line is good until. German, like the sheet.
 */
function inspectionProof(units: Unit['asset'][]): EquipmentSheetLine['inspection'] {
	const earliest = new Map<string, { name: string; sortOrder: number; due: Date }>();
	for (const unit of units) {
		for (const s of unit.inspectionSchedules) {
			const known = earliest.get(s.type.id);
			if (!known || s.nextDue < known.due) {
				earliest.set(s.type.id, {
					name: s.type.nameDe?.trim() || s.type.name,
					sortOrder: s.type.sortOrder,
					due: s.nextDue
				});
			}
		}
	}
	if (earliest.size === 0) return null;
	const now = Date.now();
	const parts = [...earliest.values()]
		.sort((a, b) => a.sortOrder - b.sortOrder)
		.map((e) =>
			e.due.getTime() < now ? `${e.name} überfällig` : `${e.name} gültig bis ${monthYear(e.due)}`
		);
	return {
		text: `Prüfung: ${parts.join(' · ')}`,
		overdue: [...earliest.values()].some((e) => e.due.getTime() < now)
	};
}

function identifier(asset: { assetTag: string | null; serialNumber: string | null }) {
	return asset.assetTag ?? (asset.serialNumber ? `SN ${asset.serialNumber}` : null);
}

// A preview that cannot be refreshed is still better than none, and a stale
// one better than failing the whole sheet over an object-store hiccup.
async function bundleImage(bundle: Bundle) {
	try {
		return await ensureBundleImage(bundle);
	} catch (cause) {
		console.error(`Could not refresh generated image for bundle "${bundle.id}":`, cause);
		return bundle.imagePath;
	}
}

async function assetImage(asset: Unit['asset']) {
	try {
		return (await ensureAssetImage(asset)) ?? asset.product.imagePath;
	} catch (cause) {
		console.error(`Could not refresh generated image for asset "${asset.id}":`, cause);
		return asset.generatedImagePath ?? asset.product.imagePath;
	}
}

/** Which section a line is listed in, and how sections are ordered. */
type Grouping = {
	ofUnit: (item: Unit) => ListGroup;
	ofBundle: (bundle: Bundle, item: Unit) => ListGroup;
	title: (group: ListGroup) => string;
};

const byCategory: Grouping = {
	ofUnit: (item) => ({ kind: 'location', name: categoryName(item.asset.product.category) }),
	ofBundle: (bundle) => ({ kind: 'location', name: categoryName(bundle.template.category) }),
	title: (group) => group.name ?? ''
};

/**
 * By the shelf a unit is kept on, so a packer walks the warehouse once — the
 * sections of the handout list. Another org's units are one section per
 * lender: their own people pack them, by their own shelves.
 */
function byShelf(sheetOrgId: string): Grouping {
	const shelf = (item: Unit, location: { name: string } | null): ListGroup =>
		item.asset.organizationId !== sheetOrgId
			? { kind: 'lender', name: orgLabel(item.asset.organization) }
			: location
				? { kind: 'location', name: location.name }
				: { kind: 'none', name: null };
	return {
		ofUnit: (item) => shelf(item, item.asset.location),
		ofBundle: (bundle, item) => shelf(item, bundle.location ?? item.asset.location),
		title: (group) =>
			group.kind === 'lender'
				? `Geliehen von ${group.name}`
				: group.kind === 'none'
					? 'Ohne Lagerort'
					: (group.name ?? '')
	};
}

/**
 * A line's net rental price per unit and day, as an offer would price it: the
 * org's price for the product (or the kit's own price, else the sum of its
 * units') times its category's rate. Null where either is missing.
 */
type Pricing = {
	unit: (item: Unit) => number | null;
	bundle: (bundle: Bundle, items: Unit[]) => number | null;
};

async function pricingFor(organizationId: string): Promise<Pricing> {
	const [prices, rates] = await Promise.all([
		prisma.orgProductPrice.findMany({ where: { organizationId } }),
		prisma.orgCategoryRate.findMany({ where: { organizationId } })
	]);
	const priceOf = new Map(prices.map((p) => [p.productId, Number(p.netPurchasePrice)]));
	const rateOf = new Map(rates.map((r) => [r.categoryId, Number(r.percentage)]));
	const daily = (net: number | null | undefined, categoryId: string) => {
		const rate = rateOf.get(categoryId);
		return net == null || rate == null ? null : Math.round(net * rate) / 100;
	};
	return {
		unit: (item) => daily(priceOf.get(item.asset.productId), item.asset.product.categoryId),
		bundle: (bundle, items) => {
			if (bundle.netPurchasePrice != null) {
				return daily(Number(bundle.netPurchasePrice), bundle.template.categoryId);
			}
			const unitPrices = items.map((item) => priceOf.get(item.asset.productId));
			if (unitPrices.some((price) => price == null)) return null;
			return daily(
				unitPrices.reduce((sum: number, price) => sum + price!, 0),
				bundle.template.categoryId
			);
		}
	};
}

type PendingLine = EquipmentSheetLine & {
	group: ListGroup;
	/** Every unit on the line, accessories and kit members included, for its proof of inspection. */
	units: Unit['asset'][];
	image: () => Promise<string | null>;
	/** The picture has to be redrawn first, which is what takes time. */
	stale: boolean;
};

/**
 * What a sheet lists: the items, with identical units collapsed into one line
 * and grouped into sections — the same collapse an offer makes, without the
 * prices.
 *
 * An accessory rides on the line of the unit it is attached to, and a unit
 * booked through a bundle that it still belongs to is part of that bundle's
 * line, so a sheet never lists a cable twice. Bundles merge only with bundles
 * of the same type holding the same contents, and nothing merges across
 * sections.
 */
async function sheetGroups(
	items: Unit[],
	grouping: Grouping,
	report: ReportProgress,
	{ pricing = null, identifiers = true }: { pricing?: Pricing | null; identifiers?: boolean } = {}
): Promise<EquipmentSheetGroup[]> {
	const bookedIds = new Set(items.map((item) => item.assetId));
	const accessoriesOf = new Map<string, Unit[]>();
	for (const item of items) {
		const parentId = item.asset.parentAssetId;
		if (!parentId || !bookedIds.has(parentId)) continue;
		accessoriesOf.set(parentId, [...(accessoriesOf.get(parentId) ?? []), item]);
	}
	const loose = items.filter(
		(item) => !item.asset.parentAssetId || !bookedIds.has(item.asset.parentAssetId)
	);
	const contentsOf = (item: Unit) => [
		productLabel(item.asset.product),
		...(accessoriesOf.get(item.assetId) ?? []).map((a) => productLabel(a.asset.product))
	];

	const lines = new Map<string, PendingLine>();
	const add = (key: string, make: () => PendingLine, id: string | null, units: Unit['asset'][]) => {
		let line = lines.get(key);
		if (!line) {
			line = make();
			lines.set(key, line);
		}
		line.quantity++;
		if (id) line.identifiers.push(id);
		line.units.push(...units);
	};

	const bundles = new Map<string, { bundle: Bundle; items: Unit[] }>();
	for (const item of loose) {
		// Booking source, not current membership, and only while the unit is
		// still in that bundle — the same rule billing uses for a kit line. A
		// unit of a kit inside the booked one is on the outer kit's line.
		const bundle = inBookedKit(item)
			? item.asset.bundleId === item.sourceBundleId
				? item.asset.bundle
				: (item.asset.bundle?.parentBundle ?? null)
			: null;
		if (bundle) {
			const entry = bundles.get(bundle.id) ?? { bundle, items: [] };
			entry.items.push(item);
			bundles.set(bundle.id, entry);
			continue;
		}
		const asset = item.asset;
		const accessories = accessoriesOf.get(asset.id) ?? [];
		const inkl = accessories.length
			? `inkl. ${summarizeContents(accessories.map((a) => productLabel(a.asset.product)))}`
			: null;
		const group = grouping.ofUnit(item);
		add(
			`${groupKey(group)}|product:${asset.productId}|${inkl ?? ''}`,
			() => ({
				group,
				units: [],
				label: productLabel(asset.product),
				subtitle: inkl,
				identifiers: [],
				quantity: 0,
				unitPrice: pricing ? pricing.unit(item) : undefined,
				imagePath: null,
				image: () =>
					accessories.length ? assetImage(asset) : Promise.resolve(asset.product.imagePath),
				stale: assetImageIsStale(asset)
			}),
			identifiers ? identifier(asset) : null,
			[asset, ...accessories.map((a) => a.asset)]
		);
	}
	for (const { bundle, items: bundleItems } of bundles.values()) {
		const contents = kitContents(bundle.id, bundleItems, contentsOf);
		const group = grouping.ofBundle(bundle, bundleItems[0]);
		add(
			`${groupKey(group)}|bundle:${bundle.templateId}|${contents}`,
			() => ({
				group,
				units: [],
				label: bundle.template.name,
				subtitle: contents,
				identifiers: [],
				quantity: 0,
				unitPrice: pricing ? pricing.bundle(bundle, bundleItems) : undefined,
				imagePath: null,
				image: () => bundleImage(bundle),
				stale: bundleImageIsStale(bundle)
			}),
			identifiers ? bundle.tag : null,
			bundleItems.flatMap((item) => [
				item.asset,
				...(accessoriesOf.get(item.assetId) ?? []).map((a) => a.asset)
			])
		);
	}

	// Only one picture per line is drawn, so only that one is brought up to date.
	// That is a fingerprint comparison for a current preview, so only the ones
	// that have to be redrawn are worth a stage of the progress bar — usually
	// none, and then there is no such stage.
	const stale = [...lines.values()].filter((line) => line.stale).length;
	let redrawn = 0;
	if (stale) report({ stage: 'previews', done: 0, total: stale });
	await Promise.all(
		[...lines.values()].map(async (line) => {
			line.imagePath = await line.image();
			if (line.stale) report({ stage: 'previews', done: ++redrawn, total: stale });
		})
	);

	const groups = new Map<string, { group: ListGroup; lines: EquipmentSheetLine[] }>();
	for (const {
		group,
		label,
		subtitle,
		identifiers,
		quantity,
		unitPrice,
		imagePath,
		units
	} of lines.values()) {
		const key = groupKey(group);
		if (!groups.has(key)) groups.set(key, { group, lines: [] });
		groups.get(key)!.lines.push({
			label,
			subtitle,
			identifiers,
			quantity,
			unitPrice,
			imagePath,
			inspection: inspectionProof(units)
		});
	}
	return [...groups.values()]
		.sort((a, b) => compareGroups(a.group, b.group))
		.map(({ group, lines }) => ({
			name: grouping.title(group),
			lines: lines.sort(
				(a, b) =>
					naturalCompare(a.label, b.label) || naturalCompare(a.subtitle ?? '', b.subtitle ?? '')
			)
		}));
}

/**
 * "bestehend aus: …" for a kit's line. A kit inside it is expanded below, one
 * line each with the inner kit's name as its heading:
 *
 *     bestehend aus: 4× Gender Changer
 *     PowerCon-Set: 2× PowerCon-Adapter, PowerCon-Kabel
 */
function kitContents(bundleId: string, items: Unit[], contentsOf: (item: Unit) => string[]) {
	const own = items.filter((item) => item.asset.bundleId === bundleId);
	const inner = new Map<string, { name: string; items: Unit[] }>();
	for (const item of items) {
		if (item.asset.bundleId === bundleId || !item.asset.bundle) continue;
		const kit = item.asset.bundle;
		const entry = inner.get(kit.id) ?? {
			name: withCaption(kit.template.name, kit.template.caption),
			items: []
		};
		entry.items.push(item);
		inner.set(kit.id, entry);
	}
	const head = `bestehend aus:${own.length ? ` ${summarizeContents(own.flatMap(contentsOf))}` : ''}`;
	const subs = [...inner.values()]
		.sort((a, b) => naturalCompare(a.name, b.name))
		.map((kit) => `${kit.name}: ${summarizeContents(kit.items.flatMap(contentsOf))}`);
	return [head, ...subs].join('\n');
}

function addressLines(address: Production['address']) {
	return address
		? [address.line1, address.line2, [address.postalCode, address.city].filter(Boolean).join(' ')]
				.map((line) => line?.trim())
				.filter((line): line is string => Boolean(line))
		: [];
}

function venueOf(production: Production) {
	return [
		...(production.venueName?.trim() ? [production.venueName.trim()] : []),
		...addressLines(production.address)
	];
}

function letterhead(org: Org): EquipmentSheet['organization'] {
	return {
		name: org.name,
		address: org.address,
		email: org.billingEmail,
		website: org.billingWebsite,
		logoPath: org.logoPath
	};
}

function period(production: Production): EquipmentSheet['meta'] {
	const { startDate, endDate } = production;
	return startDate
		? [{ label: 'Zeitraum:', value: [fmtDate(startDate), `bis ${fmtDate(endDate ?? startDate)}`] }]
		: [];
}

/**
 * The delivery note: what is booked on the production, by category, addressed
 * to the customer. Not what was asked for and refused, or is still waiting on
 * a lender — only what can actually ship.
 */
async function deliveryNoteSheet(
	productionId: string,
	report: ReportProgress,
	issuedAt = new Date()
): Promise<EquipmentSheet> {
	const production = await loadProduction(productionId, ['APPROVED', 'CHECKED_OUT', 'RETURNED']);
	const { customer } = production;
	const venue = venueOf(production);
	const rentalTerms = await productionRentalTerms(production);
	return {
		title: 'Lieferschein',
		organization: letterhead(production.organization),
		// Without a customer the goods go to the venue, and the venue is who the
		// note is addressed to.
		recipient: customer
			? {
					name:
						customer.companyName || customer.contactPerson
							? customerRecipient(customer).name
							: production.name,
					contactPerson: customerRecipient(customer).secondLine,
					address: addressLines(customer.address)
				}
			: { name: production.name, contactPerson: null, address: venue },
		meta: [
			{ label: 'Datum:', value: fmtDate(issuedAt) },
			...(customer?.customerNumber
				? [{ label: 'Kundennr.:', value: customer.customerNumber }]
				: []),
			{ label: 'Produktion:', value: production.name },
			...period(production),
			...(customer && venue.length ? [{ label: 'Lieferort:', value: venue }] : [])
		],
		productionName: production.name,
		intro: `Für die Produktion "${production.name}" liefern wir Ihnen:`,
		checkLabel: 'Geprüft',
		prices: false,
		empty: 'Dieser Produktion ist noch keine Ausrüstung zugeordnet.',
		groups: await sheetGroups(production.items, byCategory, report),
		// Hand-over: the note travels with the goods and is signed on both sides.
		// With rental terms, the signature confirms receipt under them (their
		// § 4); without, the note says in a sentence what they would have.
		closing: [
			'Bitte prüfen Sie die Lieferung bei Übernahme auf Vollständigkeit und sichtbare Schäden. ' +
				'Fehlende oder beschädigte Teile vermerken Sie bitte auf diesem Lieferschein.',
			rentalTerms
				? rentalTermsNote('delivery-note', rentalTerms)
				: 'Die Ware wird dem Empfänger vorübergehend zur Nutzung überlassen, für sämtliche Schäden ' +
					'während der Nutzungsdauer haftet der Empfänger.\n' +
					'Wir freuen uns auf Ihre Rückmeldung und stehen für Fragen gerne zur Verfügung.'
		],
		signatures: ['Übergeben', 'Übernommen']
	};
}

/**
 * The packing list: what still has to go out, by shelf. With `ownerOrgId` only
 * that org's units, on that org's letterhead — what a lender packs.
 */
async function packingListSheet(
	productionId: string,
	ownerOrgId: string | null,
	report: ReportProgress,
	issuedAt = new Date()
): Promise<EquipmentSheet> {
	const production = await loadProduction(productionId, ['APPROVED', 'CHECKED_OUT']);
	const owner =
		ownerOrgId && ownerOrgId !== production.organizationId
			? await prisma.organization.findUniqueOrThrow({
					where: { id: ownerOrgId },
					include: ORG_INCLUDE
				})
			: production.organization;
	const items = ownerOrgId
		? production.items.filter((item) => item.asset.organizationId === ownerOrgId)
		: production.items;
	const lender = owner.id !== production.organizationId;
	return {
		title: 'Packliste',
		organization: letterhead(owner),
		recipient: { name: production.name, contactPerson: null, address: venueOf(production) },
		meta: [
			{ label: 'Datum:', value: fmtDate(issuedAt) },
			...(lender ? [{ label: 'Für:', value: orgLabel(production.organization) }] : []),
			...period(production)
		],
		productionName: production.name,
		intro: ownerOrgId ? `Nur die Geräte von ${orgLabel(owner)}.` : null,
		checkLabel: 'Gepackt',
		prices: false,
		empty: 'Für diese Produktion ist nichts zu packen.',
		groups: await sheetGroups(items, byShelf(owner.id), report),
		closing: [],
		signatures: ['Gepackt', 'Geprüft']
	};
}

const FILE_PREFIX: Record<SheetKind, string> = {
	'delivery-note': 'Lieferschein',
	'packing-list': 'Packliste'
};

/**
 * A sheet as a PDF, for whoever may open the production. Rendered fresh every
 * time: neither sheet has a number or is archived, so each shows what is booked
 * right now. `ownerOrgId` (packing list only) narrows it to one org's units —
 * what a lender packs, and what the production page's owner filter carries over.
 */
export async function renderEquipmentSheet(
	kind: SheetKind,
	productionId: string,
	ownerOrgId: string | null,
	report: ReportProgress = () => {}
) {
	const production = await prisma.production.findUnique({
		where: { id: productionId },
		select: { id: true, organizationId: true, name: true }
	});
	if (!production) error(404, 'Production not found');
	// Checked before loading: gathering a sheet can regenerate preview images.
	await requireProductionRead(production);
	if (ownerOrgId && !(await prisma.organization.count({ where: { id: ownerOrgId } }))) {
		error(404, 'Organization not found');
	}
	const sheet =
		kind === 'delivery-note'
			? await deliveryNoteSheet(productionId, report)
			: await packingListSheet(productionId, ownerOrgId, report);
	return {
		bytes: await generateEquipmentSheetPdf(sheet, report),
		filename: `${FILE_PREFIX[kind]}-${production.name}.pdf`
	};
}

// ---------------------------------------------------------------------------
// An org's whole equipment

/**
 * The layouts of an org's list. `catalogue`: what the org has to rent out —
 * one line per product (a kit per kit type) with how many, by category; no
 * tags, and only what can be booked. `inventory`: everything it owns, by the
 * shelf it is kept on, with every unit's tag or serial number — retired units
 * aside, unavailable ones included, since they are still on the shelf.
 */
async function orgListSheet(
	organizationId: string,
	layout: OrgListLayout,
	prices: boolean,
	report: ReportProgress,
	issuedAt = new Date()
): Promise<EquipmentSheet> {
	const catalogue = layout === 'catalogue';
	const [org, assets, pricing] = await Promise.all([
		prisma.organization.findUniqueOrThrow({
			where: { id: organizationId },
			include: ORG_INCLUDE
		}),
		prisma.asset.findMany({
			where: { organizationId, ...(catalogue ? BOOKABLE_ASSET_WHERE : ACTIVE_ASSET_WHERE) },
			include: ASSET_INCLUDE
		}),
		prices ? pricingFor(organizationId) : null
	]);
	// A kit's line holds the units that are in it now.
	const units = assets.map((asset) => ({
		assetId: asset.id,
		// A kit inside another one is listed on the outer kit's line.
		sourceBundleId: asset.bundle?.parentBundleId ?? asset.bundleId,
		asset
	}));
	const groups = await sheetGroups(
		units,
		catalogue ? byCategory : byShelf(organizationId),
		report,
		{ pricing, identifiers: !catalogue }
	);
	const unpriced = groups.some((g) => g.lines.some((line) => line.unitPrice === null));
	return {
		title: catalogue ? 'Equipmentliste' : 'Inventarliste',
		organization: letterhead(org),
		recipient: null,
		meta: [{ label: 'Stand:', value: fmtDate(issuedAt) }],
		productionName: org.name,
		intro: null,
		checkLabel: null,
		prices: pricing !== null,
		empty: 'Hier sind noch keine Geräte erfasst.',
		groups,
		closing: pricing
			? [
					'Mietpreise pro Tag und Stück, netto zzgl. gesetzlicher MwSt.',
					...(unpriced ? ['Positionen ohne Preis auf Anfrage.'] : [])
				]
			: [],
		signatures: null
	};
}

/**
 * An org's equipment list as a PDF, for anyone in the org — the equipment is
 * what every member sees. Prices are billing, read by the org's admins only,
 * as offers are.
 */
export async function renderOrgEquipmentList(
	organizationId: string,
	{ layout, prices }: { layout: OrgListLayout; prices: boolean },
	report: ReportProgress = () => {}
) {
	await requireOrgRole(organizationId, ROLE_FOR.equipment);
	if (prices) await requireOrgInventory(organizationId, 'billing_manage_forbidden');
	const sheet = await orgListSheet(organizationId, layout, prices, report);
	return {
		bytes: await generateEquipmentSheetPdf(sheet, report),
		filename: `${sheet.title}-${sheet.productionName}.pdf`
	};
}
