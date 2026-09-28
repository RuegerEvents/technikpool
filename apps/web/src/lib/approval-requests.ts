// A loan request as the lender reads it: one production asking one of our orgs
// for equipment, laid out the way the production page lays out its own list —
// cases as one line with their contents inside, loose units per product, and
// accessories inside the unit they are bolted to rather than as units of their
// own. `getPendingApprovals` hands over flat items; this is the one place they
// are put back into that shape, so the dashboard's count and the dialog's list
// cannot disagree.

import { bundleLabel, withCaption } from '$lib/product-label';
import { nestAccessories, type Nested } from '$lib/production-items';
import { orgLabel } from '$lib/utils';

export type RequestItem = {
	id: string;
	assetId: string;
	productionId: string;
	productionVisible: boolean;
	sourceParentAssetId: string | null;
	asset: {
		organizationId: string;
		assetTag: string | null;
		parentAssetId: string | null;
		product: { id: string; name: string; caption: string | null; imagePath: string | null };
	};
	production: {
		name: string;
		startDate: Date | null;
		endDate: Date | null;
		organization: { name: string; shortName: string | null };
	};
	sourceBundle: {
		id: string;
		tag: string | null;
		imagePath: string | null;
		template: { name: string; caption: string | null };
	} | null;
};

export type RequestUnit<T extends RequestItem> = Nested<T>;

export type RequestBundle<T extends RequestItem> = {
	id: string;
	label: string;
	imagePath: string | null;
	units: RequestUnit<T>[];
};

export type RequestProduct<T extends RequestItem> = {
	productId: string;
	label: string;
	imagePath: string | null;
	units: RequestUnit<T>[];
};

export type ApprovalRequest<T extends RequestItem> = {
	key: string;
	productionId: string;
	productionName: string;
	productionVisible: boolean;
	requesterOrg: string;
	lenderOrgId: string;
	startDate: Date | null;
	endDate: Date | null;
	/** Every item, accessories included — what "approve all" sends. */
	items: T[];
	/** Units as the production page counts them: an accessory is not one. */
	unitCount: number;
	bundles: RequestBundle<T>[];
	products: RequestProduct<T>[];
};

/** A unit and everything that travels with it — what deciding on it decides. */
export function itemsOf<T extends RequestItem>(units: RequestUnit<T>[]): T[] {
	return units.flatMap((unit) => [unit, ...unit.accessories]);
}

/**
 * One request per production and lender. A user who answers for two orgs
 * gets two requests from a production that asked both, since each is decided
 * on its own.
 */
export function groupApprovalRequests<T extends RequestItem>(items: T[]): ApprovalRequest<T>[] {
	const byKey = new Map<string, T[]>();
	for (const item of items) {
		const key = `${item.productionId}:${item.asset.organizationId}`;
		const list = byKey.get(key);
		if (list) list.push(item);
		else byKey.set(key, [item]);
	}

	const requests = [...byKey.entries()].map(([key, list]) => {
		const first = list[0];
		const bundles = new Map<string, RequestBundle<T>>();
		const products = new Map<string, RequestProduct<T>>();
		const units = nestAccessories(list);
		for (const unit of units) {
			if (unit.sourceBundle) {
				const bundle = unit.sourceBundle;
				let group = bundles.get(bundle.id);
				if (!group) {
					group = {
						id: bundle.id,
						label: bundleLabel(bundle),
						imagePath: bundle.imagePath,
						units: []
					};
					bundles.set(bundle.id, group);
				}
				group.units.push(unit);
			} else {
				const product = unit.asset.product;
				let group = products.get(product.id);
				if (!group) {
					group = {
						productId: product.id,
						label: withCaption(product.name, product.caption),
						imagePath: product.imagePath,
						units: []
					};
					products.set(product.id, group);
				}
				group.units.push(unit);
			}
		}
		return {
			key,
			productionId: first.productionId,
			productionName: first.production.name,
			productionVisible: first.productionVisible,
			requesterOrg: orgLabel(first.production.organization),
			lenderOrgId: first.asset.organizationId,
			startDate: first.production.startDate,
			endDate: first.production.endDate,
			items: list,
			unitCount: units.length,
			bundles: [...bundles.values()],
			products: [...products.values()]
		};
	});
	// Soonest first, and a production without a date yet last.
	const time = (d: Date | null) => (d ? new Date(d).getTime() : Infinity);
	return requests.sort((a, b) => time(a.startDate) - time(b.startDate));
}
