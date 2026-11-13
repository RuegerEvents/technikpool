import { requested, type RemoteQueryFunction } from '$app/server';
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
} from './assets.remote';
import { getConnectorUsage } from './connectors.remote';
import { getLicenses, getLicenseStatus } from './licenses.remote';
import { getProduction } from './productions.remote';
import { getHandoverTodos } from './production-checks.remote';
import {
	getHandoutSummary,
	getPackTodos,
	getProductionHandout,
	getReturnTodos
} from './production-handout.remote';

// Not a remote file: those may export remote functions only.

/**
 * What a command changed, as far as the lists showing equipment care. Each
 * flag or id list decides which of the client's cached queries are refreshed;
 * every other one the client names is left as it is.
 */
export interface EquipmentChange {
	assetIds?: string[];
	organizationIds?: string[];
	/** The change reaches every org's lists — a merged product, a renamed maker. */
	allOrgs?: boolean;
	bundleIds?: string[];
	productionIds?: string[];
	/** A unit joined, left or moved with a kit: the kit lists. */
	bundles?: boolean;
	/** Units were added or removed: the per-product counts. */
	inventory?: boolean;
	/** Products were created, changed or their fleet moved: the catalogue lists, every org's. */
	products?: boolean;
	/** The products whose accessory profile may have moved. */
	productIds?: string[];
	/** A cable product was created: the cable vocabulary and connector usage. */
	cables?: boolean;
}

/** Far above what one client caches; a request over it puts the query into an error state. */
const LIMIT = 100;

async function refreshWhere<Arg>(
	fn: RemoteQueryFunction<Arg, unknown, Arg>,
	keep: (arg: Arg) => boolean
) {
	// `for await`: the validators are async, and the synchronous iterator refuses them.
	for await (const { arg, query, ignore } of requested(fn, LIMIT)) {
		if (keep(arg)) void query.refresh();
		else ignore();
	}
}

/**
 * Refreshes the equipment lists the calling page holds, and only where the
 * change reaches them. The page names them with `.updates(...EQUIPMENT_VIEWS)`
 * (see `#lib/equipment-views.js`).
 *
 * Refreshing all of them on the server sent each one back in the response,
 * whether any page showed it or not: 2.2 MB for one tick on the take-back list
 * of an install with 255 units — the device list twice, the kit lists four
 * times — which over a slow line is the ten seconds the tick took. Naming the
 * query functions rather than instances covers every instance the client has
 * cached, including one a page left behind that has not been collected yet;
 * one nobody holds is fetched afresh when a page opens it.
 *
 * Every query in `EQUIPMENT_VIEWS` must be handled here: one the client names
 * and the server neither refreshes nor ignores fails on the client.
 */
export async function refreshEquipmentViews(change: EquipmentChange) {
	const assets = new Set(change.assetIds ?? []);
	const orgs = new Set(change.organizationIds ?? []);
	const bundles = new Set(change.bundleIds ?? []);
	const productions = new Set(change.productionIds ?? []);
	const products = new Set(change.productIds ?? []);
	/** An org-scoped list: the all-orgs one whenever any org moved. */
	const inOrg = (org: string | undefined) =>
		!!change.allOrgs || (org === undefined ? orgs.size > 0 : orgs.has(org));

	await Promise.all([
		refreshWhere(getAssets, inOrg),
		refreshWhere(getRetiredAssets, inOrg),
		refreshWhere(getAsset, (id) => assets.has(id)),
		refreshWhere(getAssetHistory, (id) => assets.has(id)),
		refreshWhere(getBundles, (org) => !!change.bundles && inOrg(org)),
		refreshWhere(getBundleTemplates, (org) => !!change.bundles && inOrg(org)),
		refreshWhere(getBundle, (id) => bundles.has(id)),
		refreshWhere(getInventorySummary, (org) => !!change.inventory && inOrg(org)),
		refreshWhere(getLicenses, inOrg),
		refreshWhere(getLicenseStatus, (id) => assets.has(id)),
		refreshWhere(getProduction, (id) => productions.has(id)),
		refreshWhere(getHandoutSummary, (id) => productions.has(id)),
		refreshWhere(getProductionHandout, (arg) => productions.has(arg.productionId)),
		// A unit going out or coming back opens or closes a handover, a packing
		// job and a forgotten take-back.
		refreshWhere(getHandoverTodos, () => productions.size > 0),
		refreshWhere(getPackTodos, () => productions.size > 0),
		refreshWhere(getReturnTodos, () => productions.size > 0),
		refreshWhere(getProducts, () => !!change.products),
		refreshWhere(getProductCatalog, () => !!change.products),
		// A product's own page: its row and the unit counts the merge dialog reads.
		refreshWhere(getCatalogProduct, () => !!change.products || !!change.inventory),
		refreshWhere(getProductUnitCounts, () => !!change.products || !!change.inventory),
		refreshWhere(getProductAccessoryProfile, (arg) => products.has(arg.productId)),
		refreshWhere(getCableVocabulary, () => !!change.cables),
		refreshWhere(getConnectorUsage, () => !!change.cables)
	]);
}
