import { error } from '@sveltejs/kit';
import { naturalCompare } from '$lib/sort';
import { prisma } from '$lib/server/auth';
import { summarizeContents } from '$lib/billing-lines';
import { productLabel } from '$lib/product-label';
import { orgLabel } from '$lib/utils';
import { compareGroups, groupKey, type ListGroup } from '$lib/production-list';
import {
	assetImageIsStale,
	bundleImageIsStale,
	ensureAssetImage,
	ensureBundleImage
} from '$lib/server/services/bundle-image';
import { requireProductionRead } from '$lib/server/services/access';
import { fmtDate } from '../pdf-text';
import type { SheetKind } from '$lib/equipment-sheet';
import {
	generateEquipmentSheetPdf,
	type EquipmentSheet,
	type EquipmentSheetGroup,
	type EquipmentSheetLine,
	type ReportProgress
} from '../equipment-sheet-pdf';

const ORG_INCLUDE = { address: true } as const;

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
					asset: {
						include: {
							product: { include: { manufacturer: true, category: true } },
							accessories: { include: { product: true } },
							location: { select: { name: true } },
							organization: { select: { name: true, shortName: true } },
							bundle: {
								include: {
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
								}
							}
						}
					}
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
type Item = Production['items'][number];
type Bundle = NonNullable<Item['asset']['bundle']>;
type Org = Production['organization'];

function categoryName(category: { name: string; nameDe: string | null }) {
	return category.nameDe?.trim() || category.name;
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

async function assetImage(asset: Item['asset']) {
	try {
		return (await ensureAssetImage(asset)) ?? asset.product.imagePath;
	} catch (cause) {
		console.error(`Could not refresh generated image for asset "${asset.id}":`, cause);
		return asset.generatedImagePath ?? asset.product.imagePath;
	}
}

/** Which section a line is listed in, and how sections are ordered. */
type Grouping = {
	ofUnit: (item: Item) => ListGroup;
	ofBundle: (bundle: Bundle, item: Item) => ListGroup;
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
	const shelf = (item: Item, location: { name: string } | null): ListGroup =>
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

type PendingLine = EquipmentSheetLine & {
	group: ListGroup;
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
	items: Item[],
	grouping: Grouping,
	report: ReportProgress
): Promise<EquipmentSheetGroup[]> {
	const bookedIds = new Set(items.map((item) => item.assetId));
	const accessoriesOf = new Map<string, Item[]>();
	for (const item of items) {
		const parentId = item.asset.parentAssetId;
		if (!parentId || !bookedIds.has(parentId)) continue;
		accessoriesOf.set(parentId, [...(accessoriesOf.get(parentId) ?? []), item]);
	}
	const loose = items.filter(
		(item) => !item.asset.parentAssetId || !bookedIds.has(item.asset.parentAssetId)
	);
	const contentsOf = (item: Item) => [
		productLabel(item.asset.product),
		...(accessoriesOf.get(item.assetId) ?? []).map((a) => productLabel(a.asset.product))
	];

	const lines = new Map<string, PendingLine>();
	const add = (key: string, make: () => PendingLine, id: string | null) => {
		let line = lines.get(key);
		if (!line) {
			line = make();
			lines.set(key, line);
		}
		line.quantity++;
		if (id) line.identifiers.push(id);
	};

	const bundles = new Map<string, Item[]>();
	for (const item of loose) {
		// Booking source, not current membership, and only while the unit is
		// still in that bundle — the same rule billing uses for a kit line.
		const bundle =
			item.sourceBundleId !== null && item.asset.bundleId === item.sourceBundleId
				? item.asset.bundle
				: null;
		if (bundle) {
			bundles.set(bundle.id, [...(bundles.get(bundle.id) ?? []), item]);
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
				label: productLabel(asset.product),
				subtitle: inkl,
				identifiers: [],
				quantity: 0,
				imagePath: null,
				image: () =>
					accessories.length ? assetImage(asset) : Promise.resolve(asset.product.imagePath),
				stale: assetImageIsStale(asset)
			}),
			identifier(asset)
		);
	}
	for (const bundleItems of bundles.values()) {
		const bundle = bundleItems[0].asset.bundle!;
		const contents = summarizeContents(bundleItems.flatMap(contentsOf));
		const group = grouping.ofBundle(bundle, bundleItems[0]);
		add(
			`${groupKey(group)}|bundle:${bundle.templateId}|${contents}`,
			() => ({
				group,
				label: bundle.template.name,
				subtitle: `bestehend aus: ${contents}`,
				identifiers: [],
				quantity: 0,
				imagePath: null,
				image: () => bundleImage(bundle),
				stale: bundleImageIsStale(bundle)
			}),
			bundle.tag
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
	for (const { group, label, subtitle, identifiers, quantity, imagePath } of lines.values()) {
		const key = groupKey(group);
		if (!groups.has(key)) groups.set(key, { group, lines: [] });
		groups.get(key)!.lines.push({ label, subtitle, identifiers, quantity, imagePath });
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
	return {
		title: 'Lieferschein',
		organization: letterhead(production.organization),
		// Without a customer the goods go to the venue, and the venue is who the
		// note is addressed to.
		recipient: customer
			? {
					name: customer.companyName || customer.contactPerson || production.name,
					contactPerson: customer.companyName ? customer.contactPerson : null,
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
		empty: 'Dieser Produktion ist noch keine Ausrüstung zugeordnet.',
		groups: await sheetGroups(production.items, byCategory, report),
		// Hand-over: the note travels with the goods and is signed on both sides.
		closing: [
			'Bitte prüfen Sie die Lieferung bei Übernahme auf Vollständigkeit und sichtbare Schäden. ' +
				'Fehlende oder beschädigte Teile vermerken Sie bitte auf diesem Lieferschein.',
			'Die Ware wird dem Empfänger vorübergehend zur Nutzung überlassen, für sämtliche Schäden ' +
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
