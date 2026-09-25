import type { Schemas } from '$lib/server/api';
import type { OrgRole } from '$lib/roles';
import { imageSrc } from '$lib/images';
import { isCable } from '$lib/cable';
import { withCableNames } from '$lib/server/services/cable-ends';
import {
	itemState,
	productCounts,
	type StocktakeDetail,
	type StocktakeItemRow,
	type StocktakeScanOutcome,
	type StocktakeSummary
} from '$lib/server/services/stocktake';

// Prisma payloads are deliberately not returned straight to clients: they carry
// fields the API doesn't promise, and adding a column to the schema would
// silently widen the response. Mapping through these functions means the
// compiler checks every response against openapi.yaml.

type OrgRow = {
	id: string;
	name: string;
	shortName: string | null;
	color: string;
	avatarLabel: string;
};

export function toOrganization(org: OrgRow): Schemas['Organization'] {
	return {
		id: org.id,
		name: org.name,
		shortName: org.shortName,
		color: org.color,
		avatarLabel: org.avatarLabel
	};
}

/**
 * The same organization, plus the rung the caller stands on in it. Only `/me`
 * answers with these: an organization named by an asset or a production is a
 * label, and attaching a role there would invite a client to read one unit's
 * badge as permission over another org's.
 *
 * `role` is left out only for a system admin's view of an organization they
 * have no membership in — `isAdmin` is what grants them that one. Omitted
 * rather than null so the wire value stays a plain enum; see openapi.yaml.
 */
export function toMemberOrganization(
	org: OrgRow,
	role: OrgRole | undefined
): Schemas['MemberOrganization'] {
	return { ...toOrganization(org), ...(role ? { role } : {}) };
}

type AddressRow = {
	id: string;
	line1: string;
	line2: string | null;
	postalCode: string;
	city: string;
};

export function toAddress(address: AddressRow): Schemas['Address'] {
	return {
		id: address.id,
		line1: address.line1,
		line2: address.line2,
		postalCode: address.postalCode,
		city: address.city
	};
}

type LocationRow = {
	id: string;
	name: string;
	organization: OrgRow;
	address?: AddressRow | null;
};

export function toLocation(location: LocationRow): Schemas['Location'] {
	return {
		id: location.id,
		name: location.name,
		organization: toOrganization(location.organization),
		address: location.address ? toAddress(location.address) : null
	};
}

type ProductionRow = {
	id: string;
	name: string;
	startDate: Date | null;
	endDate: Date | null;
	organization: OrgRow;
};

export function toProduction(production: ProductionRow): Schemas['Production'] {
	return {
		id: production.id,
		name: production.name,
		startDate: production.startDate?.toISOString() ?? null,
		endDate: production.endDate?.toISOString() ?? null,
		organization: toOrganization(production.organization)
	};
}

type CategoryRow = {
	id: string;
	name: string;
	color: string;
	sortOrder: number;
};

export function toCategory(category: CategoryRow): Schemas['Category'] {
	return {
		id: category.id,
		name: category.name,
		color: category.color,
		sortOrder: category.sortOrder
	};
}

type EndRefs = {
	connectorARef: { name: string } | null;
	connectorBRef: { name: string } | null;
};

/** A product as the handlers load it: `include: { manufacturer, category, ...CABLE_ENDS }`. */
type ProductRow = EndRefs & {
	id: string;
	name: string;
	imagePath: string | null;
	cableType: string | null;
	lengthCm: number | null;
	ways: (EndRefs & { count: number; cableType: string | null })[];
	manufacturer: { name: string } | null;
	category: CategoryRow;
};

type CableRow = EndRefs & Pick<ProductRow, 'cableType' | 'lengthCm' | 'ways'>;

/**
 * Any of the four columns makes it a cable — see isCable. `type` is the wire
 * (CAT7, 2,5 mm²) and is null on most of them. A loom carries its ends in
 * `ways` and has none of its own.
 */
function toCableSpec(row: CableRow): Schemas['CableSpec'] | null {
	const product = withCableNames(row);
	if (!isCable(product)) return null;
	return {
		type: product.cableType,
		connectorA: product.connectorA,
		connectorB: product.connectorB,
		lengthCm: product.lengthCm,
		ways: product.ways.map((way) => ({
			count: way.count,
			type: way.cableType,
			connectorA: way.connectorA,
			connectorB: way.connectorB
		}))
	};
}

export function toProduct(product: ProductRow): Schemas['Product'] {
	return {
		id: product.id,
		name: product.name,
		manufacturerName: product.manufacturer?.name ?? null,
		category: toCategory(product.category),
		// The API keeps promising an address, because the scanner has nowhere to
		// resolve a key against. What changed is where it comes from: it is built
		// per response now, so a moved object store is picked up on the next
		// request rather than needing every row rewritten.
		imageUrl: imageSrc(product.imagePath),
		cable: toCableSpec(product)
	};
}

type AssetRow = {
	id: string;
	assetTag: string | null;
	serialNumber: string | null;
	status: string;
	bundleId: string | null;
	parentAssetId: string | null;
	product: ProductRow;
	location: LocationRow;
	organization: OrgRow;
};

export function toAsset(asset: AssetRow): Schemas['Asset'] {
	return {
		id: asset.id,
		assetTag: asset.assetTag,
		serialNumber: asset.serialNumber,
		// Free text in the database; the spec pins it to the three values the app
		// actually writes. Anything else would be a data bug, not a new state.
		status: asset.status as Schemas['Asset']['status'],
		product: toProduct(asset.product),
		location: toLocation(asset.location),
		organization: toOrganization(asset.organization),
		bundleId: asset.bundleId,
		parentAssetId: asset.parentAssetId
	};
}

type TransactionRow = {
	id: string;
	action: string;
	createdAt: Date;
	user: { name: string | null; email: string } | null;
	production: { name: string } | null;
};

export function toAssetTransaction(tx: TransactionRow): Schemas['AssetTransaction'] {
	return {
		id: tx.id,
		action: tx.action,
		createdAt: tx.createdAt.toISOString(),
		userName: tx.user?.name ?? tx.user?.email ?? null,
		productionName: tx.production?.name ?? null
	};
}

// ---------------------------------------------------------------------------
// Stocktakes

type StocktakeSummaryRow = Pick<
	StocktakeSummary,
	| 'id'
	| 'name'
	| 'status'
	| 'organization'
	| 'createdAt'
	| 'createdBy'
	| 'closedAt'
	| 'progress'
	| 'countingLocations'
>;

export function toStocktakeSummary(s: StocktakeSummaryRow): Schemas['StocktakeSummary'] {
	return {
		id: s.id,
		name: s.name,
		status: s.status === 'CLOSED' ? 'CLOSED' : 'OPEN',
		organization: toOrganization(s.organization),
		createdAt: s.createdAt.toISOString(),
		createdByName: s.createdBy.name || s.createdBy.email,
		closedAt: s.closedAt?.toISOString() ?? null,
		progress: s.progress,
		countingLocations: s.countingLocations
	};
}

export function toStocktakeItem(
	item: StocktakeItemRow,
	closed: boolean,
	userId: string
): Schemas['StocktakeItem'] {
	const bundle = item.asset.bundle;
	return {
		assetId: item.assetId,
		assetTag: item.asset.assetTag,
		serialNumber: item.asset.serialNumber,
		productName: item.asset.product.name,
		manufacturerName: item.asset.product.manufacturer?.name ?? null,
		category: toCategory(item.asset.product.category),
		cable: toCableSpec(item.asset.product),
		parentAssetId: item.asset.parentAssetId,
		bundleName: bundle
			? bundle.tag
				? `${bundle.template.name} (${bundle.tag})`
				: bundle.template.name
			: null,
		state: itemState(item, closed),
		expectedLocation: item.expectedLocation,
		foundLocation: item.foundLocation,
		outAt: item.outProductionName,
		unexpectedReason: item.unexpectedReason,
		foundByName: item.foundBy ? item.foundBy.name || item.foundBy.email : null,
		foundByMe: !!item.foundAt && item.foundById === userId,
		note: item.note,
		needsAttention: item.needsAttention
	};
}

export function toStocktakeDetail(
	detail: StocktakeDetail,
	userId: string
): Schemas['StocktakeDetail'] {
	const closed = detail.status === 'CLOSED';
	return {
		...toStocktakeSummary(detail),
		items: detail.items.map((i) => toStocktakeItem(i, closed, userId)),
		products: productCounts(detail, userId).map((p) => ({
			productId: p.product.id,
			productName: p.product.name,
			manufacturerName: p.product.manufacturer?.name ?? null,
			category: toCategory(p.product.category),
			cable: toCableSpec(p.product),
			expected: p.expected,
			out: p.out,
			counted: p.counted,
			locations: p.locations.map((l) => ({
				location: l.location,
				expected: l.expected,
				counted: l.counted,
				myCount: l.myCount
			}))
		}))
	};
}

export function toStocktakeScanResult(
	result: StocktakeScanOutcome,
	closed: boolean,
	userId: string
): Schemas['StocktakeScanResult'] {
	if (result.outcome === 'bundle') {
		return { outcome: 'bundle', item: null, bundle: result.bundle, confirm: result.confirm };
	}
	if (result.outcome === 'already') {
		return {
			outcome: 'already',
			item: toStocktakeItem(result.item, closed, userId),
			alreadyFoundByName: result.foundByName,
			confirm: []
		};
	}
	return {
		outcome: result.outcome,
		item: toStocktakeItem(result.item, closed, userId),
		wasOutAt: result.wasOutAt,
		confirm: result.confirm,
		confirmGroup: result.confirmGroup
	};
}
