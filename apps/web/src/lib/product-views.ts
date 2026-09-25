import {
	getAsset,
	getAssets,
	getInventorySummary,
	getProductCatalog,
	getProducts
} from '$lib/remote/assets.remote';

/**
 * Every query that shows a product, for `.updates(...)` on a command that
 * changes one: `updateProduct`, `setProductPorts`, `revertCatalogChange`. The
 * server refreshes only what the page names, so a page that leaves this off
 * keeps showing the old product — see `refreshProductViews`.
 */
export const PRODUCT_VIEWS = [
	getProducts,
	getProductCatalog,
	getAssets,
	getAsset,
	getInventorySummary
] as const;
