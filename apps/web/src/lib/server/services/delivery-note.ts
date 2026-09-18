import { prisma } from '$lib/server/auth';
import { productBillingLabel, summarizeContents } from '$lib/billing-lines';
import { ensureAssetImage, ensureBundleImage } from '$lib/server/services/bundle-image';
import type { DeliveryNoteData, DeliveryNoteGroup, DeliveryNoteLine } from '../delivery-note-pdf';

async function loadProduction(productionId: string) {
	return prisma.production.findUniqueOrThrow({
		where: { id: productionId },
		include: {
			organization: { include: { address: true } },
			address: true,
			customer: { include: { address: true } },
			items: {
				include: {
					asset: {
						include: {
							product: { include: { manufacturer: true, category: true } },
							accessories: { include: { product: true } },
							bundle: {
								include: {
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
				// Same order as the production page, so two prints of one note agree.
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

function categoryName(category: { name: string; nameDe: string | null }) {
	return category.nameDe?.trim() || category.name;
}

function identifier(asset: { assetTag: string | null; serialNumber: string | null }) {
	return asset.assetTag ?? (asset.serialNumber ? `SN ${asset.serialNumber}` : null);
}

// A preview that cannot be refreshed is still better than none, and a stale
// one better than failing the whole note over an object-store hiccup.
async function bundleImage(bundle: NonNullable<Item['asset']['bundle']>) {
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

type PendingLine = DeliveryNoteLine & {
	key: string;
	category: string;
	image: () => Promise<string | null>;
};

/**
 * What a delivery note lists: everything booked on the production, with
 * identical units collapsed into one line and grouped by category — the same
 * collapse an offer makes, without the prices.
 *
 * An accessory rides on the line of the unit it is attached to, and a unit
 * booked through a bundle that it still belongs to is part of that bundle's
 * line, so a note never lists a cable twice. Bundles merge only with bundles
 * of the same type holding the same contents.
 */
export async function deliveryNoteData(productionId: string) {
	const production = await loadProduction(productionId);
	const items = production.items;
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
		productBillingLabel(item.asset.product),
		...(accessoriesOf.get(item.assetId) ?? []).map((a) => productBillingLabel(a.asset.product))
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
			? `inkl. ${summarizeContents(accessories.map((a) => productBillingLabel(a.asset.product)))}`
			: null;
		add(
			`product:${asset.productId}|${inkl ?? ''}`,
			() => ({
				key: `product:${asset.productId}|${inkl ?? ''}`,
				category: categoryName(asset.product.category),
				label: productBillingLabel(asset.product),
				subtitle: inkl,
				identifiers: [],
				quantity: 0,
				imagePath: null,
				image: () =>
					accessories.length ? assetImage(asset) : Promise.resolve(asset.product.imagePath)
			}),
			identifier(asset)
		);
	}
	for (const bundleItems of bundles.values()) {
		const bundle = bundleItems[0].asset.bundle!;
		const contents = summarizeContents(bundleItems.flatMap(contentsOf));
		const key = `bundle:${bundle.templateId}|${contents}`;
		add(
			key,
			() => ({
				key,
				category: categoryName(bundle.template.category),
				label: bundle.template.name,
				subtitle: `bestehend aus: ${contents}`,
				identifiers: [],
				quantity: 0,
				imagePath: null,
				image: () => bundleImage(bundle)
			}),
			bundle.tag
		);
	}

	// Only one picture per line is drawn, so only that one is brought up to date.
	await Promise.all(
		[...lines.values()].map(async (line) => {
			line.imagePath = await line.image();
		})
	);

	const collator = new Intl.Collator('de', { numeric: true, sensitivity: 'base' });
	const groups = new Map<string, DeliveryNoteGroup>();
	for (const { category, label, subtitle, identifiers, quantity, imagePath } of lines.values()) {
		let group = groups.get(category);
		if (!group) {
			group = { name: category, lines: [] };
			groups.set(category, group);
		}
		group.lines.push({ label, subtitle, identifiers, quantity, imagePath });
	}
	for (const group of groups.values())
		group.lines.sort(
			(a, b) =>
				collator.compare(a.label, b.label) || collator.compare(a.subtitle ?? '', b.subtitle ?? '')
		);

	const { organization, customer } = production;
	const addressLines = (address: Production['address']) =>
		address
			? [address.line1, address.line2, [address.postalCode, address.city].filter(Boolean).join(' ')]
					.map((line) => line?.trim())
					.filter((line): line is string => Boolean(line))
			: [];
	const venue = [
		...(production.venueName?.trim() ? [production.venueName.trim()] : []),
		...addressLines(production.address)
	];
	const data: DeliveryNoteData = {
		organization: {
			name: organization.name,
			address: organization.address,
			email: organization.billingEmail,
			website: organization.billingWebsite
		},
		// Without a customer the goods go to the venue, and the venue is who the
		// note is addressed to.
		recipient: customer
			? {
					name: customer.companyName || customer.contactPerson || production.name,
					contactPerson: customer.companyName ? customer.contactPerson : null,
					address: addressLines(customer.address)
				}
			: { name: production.name, contactPerson: null, address: venue },
		customerNumber: customer?.customerNumber ?? null,
		productionName: production.name,
		venue: customer ? venue : [],
		startDate: production.startDate,
		endDate: production.endDate,
		groups: [...groups.values()].sort((a, b) => collator.compare(a.name, b.name))
	};
	return data;
}
