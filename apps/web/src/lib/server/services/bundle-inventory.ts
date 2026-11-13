import { error } from '@sveltejs/kit';
import { prisma } from '#lib/server/auth.js';
import { ACTIVE_ASSET_WHERE } from '#lib/asset-status.js';
import { naturalCompare } from '#lib/sort.js';
import { isSystemAdmin, userOrgIds } from './access';
import {
	generateBundleInventoryPdf,
	inventoryTiles,
	type InventoryTile,
	type InventorySheet,
	type InventorySheetLayout,
	type InventorySheetSize
} from '../bundle-inventory-pdf';

/**
 * A kit's inventory list as a PDF, for the lid of its case. Whoever may open
 * the kit may print it — the same check as `getBundle`: a member of the owning
 * org at any rung, or a system admin.
 */
/**
 * The kits packed in a case, a tile per kit type: kits of one type hold the
 * same, so "2× DMX-Ring" with one list of what each holds.
 */
function kitTiles(
	kits: {
		templateId: string;
		imagePath: string | null;
		template: { name: string };
		assets: { productId: string; product: { name: string } }[];
	}[]
): InventoryTile[] {
	const byType = new Map<string, InventoryTile>();
	for (const kit of kits) {
		const known = byType.get(kit.templateId);
		if (known) {
			known.count++;
			continue;
		}
		const contents = new Map<string, { name: string; count: number }>();
		for (const asset of kit.assets) {
			const entry = contents.get(asset.productId) ?? { name: asset.product.name, count: 0 };
			entry.count++;
			contents.set(asset.productId, entry);
		}
		byType.set(kit.templateId, {
			kind: 'kit',
			count: 1,
			name: kit.template.name,
			maker: null,
			imagePath: kit.imagePath,
			details: [...contents.values()]
				.sort((a, b) => naturalCompare(a.name, b.name))
				.map(({ name, count }) => ({ count, each: false, name })),
			accessoryOf: null
		});
	}
	return [...byType.values()]
		.sort((a, b) => naturalCompare(a.name, b.name))
		.map((tile) => ({
			...tile,
			details: tile.details.map((detail) => ({ ...detail, each: tile.count > 1 }))
		}));
}

export async function renderBundleInventory(
	userId: string,
	bundleId: string,
	size: InventorySheetSize,
	layout: InventorySheetLayout
) {
	const bundle = await prisma.assetBundle.findUnique({
		where: { id: bundleId },
		select: {
			tag: true,
			location: { select: { name: true } },
			template: {
				select: {
					name: true,
					caption: true,
					organizationId: true,
					organization: { select: { name: true, shortName: true, logoPath: true } }
				}
			},
			assets: {
				where: ACTIVE_ASSET_WHERE,
				select: {
					id: true,
					parentAssetId: true,
					productId: true,
					product: {
						select: { name: true, imagePath: true, manufacturer: { select: { name: true } } }
					}
				}
			},
			// A kit packed in this one is one tile: its picture, and what it holds
			// in small type — its own sheet lists it in full.
			childBundles: {
				select: {
					id: true,
					templateId: true,
					imagePath: true,
					template: { select: { name: true } },
					assets: {
						where: ACTIVE_ASSET_WHERE,
						select: { productId: true, product: { select: { name: true } } }
					}
				}
			}
		}
	});
	if (!bundle) error(404, 'Bundle not found');
	const orgIds = await userOrgIds(userId);
	if (!orgIds.includes(bundle.template.organizationId) && !(await isSystemAdmin(userId))) {
		error(403, 'Forbidden');
	}

	const org = bundle.template.organization;
	const sheet: InventorySheet = {
		name: bundle.template.name,
		caption: bundle.template.caption,
		tag: bundle.tag,
		organization: { name: org.shortName ?? org.name, logoPath: org.logoPath },
		unitCount:
			bundle.assets.length + bundle.childBundles.reduce((sum, kit) => sum + kit.assets.length, 0),
		tiles: [
			...inventoryTiles(
				bundle.assets.map((asset) => ({
					id: asset.id,
					parentId: asset.parentAssetId,
					productId: asset.productId,
					name: asset.product.name,
					maker: asset.product.manufacturer?.name ?? null,
					imagePath: asset.product.imagePath
				}))
			),
			...kitTiles(bundle.childBundles)
		]
	};

	const name = bundle.tag ? `${bundle.template.name} ${bundle.tag}` : bundle.template.name;
	return {
		bytes: await generateBundleInventoryPdf(sheet, size, layout),
		filename: `Inventarliste-${name}.pdf`
	};
}
