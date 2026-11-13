import {
	getAsset,
	getAssetHistory,
	getAssets,
	getBundle,
	getBundles,
	getBundleTemplates,
	getCableVocabulary,
	getCatalogProduct,
	getInventorySummary,
	getProductAccessoryProfile,
	getProductCatalog,
	getProducts,
	getProductUnitCounts,
	getRetiredAssets
} from '#lib/remote/assets.remote.js';
import { getConnectorUsage } from '#lib/remote/connectors.remote.js';
import { getLicenses, getLicenseStatus } from '#lib/remote/licenses.remote.js';
import { getProduction } from '#lib/remote/productions.remote.js';
import { getHandoverTodos } from '#lib/remote/production-checks.remote.js';
import {
	getHandoutSummary,
	getPackTodos,
	getProductionHandout,
	getReturnTodos
} from '#lib/remote/production-handout.remote.js';

/**
 * Every query that shows units, kits or bookings, for `.updates(...)` on a
 * command that books, moves, creates, edits or deletes equipment, kits or
 * catalogue entries. The server refreshes only
 * what the page holds and the change reaches — see `refreshEquipmentViews`
 * in `#lib/remote/equipment-views.ts`, which has to handle every entry here.
 * A page that leaves this off keeps showing the old state.
 */
export const EQUIPMENT_VIEWS = [
	getAssets,
	getRetiredAssets,
	getAsset,
	getAssetHistory,
	getBundles,
	getBundleTemplates,
	getBundle,
	getInventorySummary,
	getLicenses,
	getLicenseStatus,
	getProduction,
	getHandoutSummary,
	getProductionHandout,
	getHandoverTodos,
	getPackTodos,
	getReturnTodos,
	getProducts,
	getProductCatalog,
	getCatalogProduct,
	getProductUnitCounts,
	getProductAccessoryProfile,
	getCableVocabulary,
	getConnectorUsage
] as const;
