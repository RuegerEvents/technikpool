import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { prisma } from '$lib/server/auth';
import { getObject, PUBLIC_PREFIX, putObject } from '$lib/server/storage';

type BundleForImage = {
	id: string;
	imagePath: string | null;
	imageFingerprint: string | null;
	assets: Array<{
		parentAssetId: string | null;
		product: { id: string; imagePath: string | null };
	}>;
};

type AssetForImage = {
	id: string;
	generatedImagePath: string | null;
	generatedImageFingerprint: string | null;
	product: { id: string; imagePath: string | null };
	accessories: Array<{ product: { id: string; imagePath: string | null } }>;
};

type ImageContents = BundleForImage['assets'];

function fingerprint(assets: ImageContents) {
	const contents = assets
		.map((asset) => [asset.product.id, asset.product.imagePath, Boolean(asset.parentAssetId)])
		.sort((a, b) => String(a).localeCompare(String(b)));
	return createHash('sha256')
		.update(JSON.stringify(['thumbnail-v10', contents]))
		.digest('hex')
		.slice(0, 20);
}

/**
 * Device pixels a viewBox unit is worth, and the reason the photos are resized
 * at all.
 *
 * A preview is shown at roughly card width — ~400 CSS px for the grid at
 * /assets/bundles, capped on the detail page — so 600 units span ~600 CSS px at
 * most, twice that in device pixels on a HiDPI screen. Embedding the stored
 * photo at full size instead is what made these blurry in Firefox: every tile
 * carried a 480x480 PNG that decodes to ~900 KB of RGBA, twelve bundles' worth
 * on one page, and under that much cache pressure Firefox draws an `<image>`
 * from whatever undersized surface it still holds rather than blocking on a
 * re-decode. The badges stayed sharp because they are vector; only the photos
 * went soft, and a browser zoom (which re-requests at a new size) fixed it.
 */
const DEVICE_PIXELS_PER_UNIT = 2;

/**
 * The photo, scaled to the tile it is drawn into and re-encoded as WebP.
 *
 * `box` is that tile in viewBox units. sharp's `fit: 'inside'` is the same rule
 * as the `preserveAspectRatio="xMidYMid meet"` the `<image>` is drawn with, so
 * the stored pixels land one-to-one on the drawn ones and a square photo in a
 * wide strip is sized by the strip's height, not its width. `withoutEnlargement`
 * keeps a photo that is already small from being upscaled into the payload.
 */
async function embeddedImage(path: string | null, box: { width: number; height: number }) {
	if (!path || /^(https?:)?\/\//i.test(path) || path.startsWith('data:')) return null;
	try {
		const object = await getObject(path);
		if (!object.contentType.startsWith('image/') || object.contentType === 'image/svg+xml')
			return null;
		try {
			const thumbnail = await sharp(Buffer.from(object.bytes))
				.resize({
					width: Math.ceil(box.width * DEVICE_PIXELS_PER_UNIT),
					height: Math.ceil(box.height * DEVICE_PIXELS_PER_UNIT),
					fit: 'inside',
					withoutEnlargement: true
				})
				.webp({ quality: 82 })
				.toBuffer();
			return `data:image/webp;base64,${thumbnail.toString('base64')}`;
		} catch (cause) {
			// A photo sharp cannot decode is still worth more at full size than
			// replaced by the "no image" placeholder the caller falls back to.
			console.warn(`Could not downscale product image "${path}"; embedding it as-is:`, cause);
			return `data:${object.contentType};base64,${Buffer.from(object.bytes).toString('base64')}`;
		}
	} catch (error) {
		console.warn(`Could not include product image "${path}" in bundle preview:`, error);
		return null;
	}
}

async function render(assets: ImageContents) {
	const uniqueProducts = new Map<
		string,
		{ imagePath: string | null; count: number; accessory: boolean }
	>();
	for (const { product, parentAssetId } of assets) {
		const accessory = parentAssetId !== null;
		const key = `${accessory ? 'accessory' : 'primary'}:${product.id}`;
		const existing = uniqueProducts.get(key);
		if (existing) existing.count++;
		else uniqueProducts.set(key, { imagePath: product.imagePath, count: 1, accessory });
	}
	const allProducts = [...uniqueProducts.values()];
	const productsWithImages = allProducts.filter((product) => product.imagePath);
	const primary = productsWithImages
		.filter((product) => !product.accessory)
		.sort((a, b) => b.count - a.count);
	const accessories = productsWithImages
		.filter((product) => product.accessory)
		.sort((a, b) => b.count - a.count);
	const missingImageCount = allProducts
		.filter((product) => !product.imagePath)
		.reduce((total, product) => total + product.count, 0);
	const secondary = accessories.slice(0, 4);
	if (missingImageCount > 0) {
		if (secondary.length === 4) secondary.pop();
		secondary.push({ imagePath: null, count: missingImageCount, accessory: true });
	}
	// Larger bundles reserve a compact bottom strip for accessories. For small
	// bundles all products share the expressive 1–4 item layouts instead.
	const useAccessoryStrip = primary.length >= 2 && secondary.length > 0;
	const products = useAccessoryStrip
		? [...primary.slice(0, 6), ...secondary]
		: [...primary, ...secondary].slice(0, 9);

	const gap = 24;
	type Rect = { x: number; y: number; width: number; height: number };
	const rects: Rect[] = [];
	const addGrid = (count: number, area: Rect, columns: number) => {
		const rows = Math.ceil(count / columns);
		const width = (area.width - gap * (columns - 1)) / columns;
		const height = (area.height - gap * (rows - 1)) / rows;
		for (let index = 0; index < count; index++) {
			rects.push({
				x: area.x + (index % columns) * (width + gap),
				y: area.y + Math.floor(index / columns) * (height + gap),
				width,
				height
			});
		}
	};
	const fullArea = { x: gap, y: gap, width: 600 - gap * 2, height: 450 - gap * 2 };
	if (useAccessoryStrip) {
		const primaryCount = Math.min(primary.length, 6);
		addGrid(primaryCount, { ...fullArea, height: 300 }, primaryCount <= 2 ? primaryCount : 3);
		addGrid(
			products.length - primaryCount,
			{ x: gap, y: 348, width: 552, height: 78 },
			products.length - primaryCount
		);
	} else if (products.length === 1) {
		rects.push(fullArea);
	} else if (products.length === 2) {
		addGrid(2, fullArea, 2);
	} else if (products.length === 3) {
		const leftWidth = 344;
		rects.push({ ...fullArea, width: leftWidth });
		addGrid(
			2,
			{
				x: gap + leftWidth + gap,
				y: gap,
				width: fullArea.width - leftWidth - gap,
				height: fullArea.height
			},
			1
		);
	} else if (products.length === 4) {
		addGrid(4, fullArea, 2);
	} else {
		addGrid(products.length, fullArea, 3);
	}

	// Fetched only now that the layout is known: each photo is resized to the
	// tile it lands in, and an accessory in the bottom strip is a quarter the
	// height of a main tile.
	const images = await Promise.all(
		products.map((product, index) => embeddedImage(product.imagePath, rects[index]))
	);

	const tiles = products
		.map((product, index) => {
			const { x, y, width, height } = rects[index];
			const artwork = images[index]
				? `<image href="${images[index]}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"/>`
				: `<path d="M${x + width / 2 - 22} ${y + height / 2}h44m-22-22v44" stroke="#9ca3af" stroke-width="6" stroke-linecap="round"/>`;
			const small = height < 100;
			const badgeHeight = small ? 36 : 58;
			const fontSize = small ? 22 : 36;
			const badgeWidth = (product.count >= 10 ? 1.8 : 1.45) * badgeHeight;
			const badgeX = x + width - badgeWidth;
			return `${artwork}<rect x="${badgeX}" y="${y}" width="${badgeWidth}" height="${badgeHeight}" rx="${badgeHeight / 2}" fill="#111827"/><text x="${badgeX + badgeWidth / 2}" y="${y + badgeHeight * 0.7}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${fontSize}" font-weight="700" fill="#fff">${product.count}x</text>`;
		})
		.join('');
	const empty =
		products.length === 0
			? '<path d="M272 225h56m-28-28v56" stroke="#9ca3af" stroke-width="7" stroke-linecap="round"/>'
			: '';
	return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="450" viewBox="0 0 600 450">${tiles}${empty}</svg>`;
}

/** Generate only when contents changed; force creates a fresh URL to bust browser caches. */
export async function ensureBundleImage(bundle: BundleForImage, force = false) {
	const currentFingerprint = fingerprint(bundle.assets);
	if (!force && bundle.imagePath && bundle.imageFingerprint === currentFingerprint)
		return bundle.imagePath;
	const svg = await render(bundle.assets);
	const suffix = force ? `${currentFingerprint}-${randomUUID()}` : currentFingerprint;
	const path = `${PUBLIC_PREFIX}/bundles/${bundle.id}-${suffix}.svg`;
	await putObject(path, new TextEncoder().encode(svg), 'image/svg+xml');
	await prisma.assetBundle.update({
		where: { id: bundle.id },
		data: { imagePath: path, imageFingerprint: currentFingerprint }
	});
	bundle.imagePath = path;
	bundle.imageFingerprint = currentFingerprint;
	return path;
}

/** Generate a bundle-style preview for a unit that has attached accessories. */
export async function ensureAssetImage(asset: AssetForImage, force = false) {
	if (asset.accessories.length === 0) return null;
	const contents: ImageContents = [
		{ parentAssetId: null, product: asset.product },
		...asset.accessories.map((accessory) => ({
			parentAssetId: asset.id,
			product: accessory.product
		}))
	];
	const currentFingerprint = fingerprint(contents);
	if (
		!force &&
		asset.generatedImagePath &&
		asset.generatedImageFingerprint === currentFingerprint
	) {
		return asset.generatedImagePath;
	}
	const svg = await render(contents);
	const suffix = force ? `${currentFingerprint}-${randomUUID()}` : currentFingerprint;
	const path = `${PUBLIC_PREFIX}/assets/${asset.id}-${suffix}.svg`;
	await putObject(path, new TextEncoder().encode(svg), 'image/svg+xml');
	await prisma.asset.update({
		where: { id: asset.id },
		data: {
			generatedImagePath: path,
			generatedImageFingerprint: currentFingerprint
		}
	});
	asset.generatedImagePath = path;
	asset.generatedImageFingerprint = currentFingerprint;
	return path;
}
