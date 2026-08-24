import type { Schemas } from '$lib/server/api';

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

type ProductRow = {
	id: string;
	name: string;
	imageUrl: string | null;
	manufacturer: { name: string };
	category: CategoryRow;
};

export function toProduct(product: ProductRow): Schemas['Product'] {
	return {
		id: product.id,
		name: product.name,
		manufacturerName: product.manufacturer.name,
		category: toCategory(product.category),
		imageUrl: product.imageUrl
	};
}

type AssetRow = {
	id: string;
	assetTag: string | null;
	serialNumber: string | null;
	status: string;
	bundleId: string | null;
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
		bundleId: asset.bundleId
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
