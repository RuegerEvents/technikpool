import type { ListCase, ListCaseRef } from '#lib/pack-cases.js';
import type { Schemas } from '#lib/server/api.js';
import type { TransactionData } from '#lib/types/asset-transaction.js';
import type { OrgRole } from '#lib/roles.js';
import { imageSrc } from '#lib/images.js';
import { naturalCompare } from '#lib/sort.js';
import { isCable } from '#lib/cable.js';
import {
	DEFAULT_INSPECTION_TYPE_ID,
	inspectionOverride,
	requiredInspectionTypes
} from '#lib/inspection-due.js';
import { portRequirement } from '#lib/ports.js';
import { bundleLabel, withCaption } from '#lib/product-label.js';
import { withCableNames } from '#lib/server/services/cable-ends.js';
import {
	itemState,
	productCounts,
	type StocktakeDetail,
	type StocktakeItemRow,
	type ConfirmEntry,
	type StocktakeScanOutcome,
	type StocktakeSummary
} from '#lib/server/services/stocktake.js';
import { userLabel } from '#lib/user-label.svelte.js';
import type { CaseCheck } from '#lib/server/services/case-check.js';
import type { ProductionCheckView } from '#lib/server/services/production-check.js';
import type { HandoutCandidate, HandoutView } from '#lib/server/services/production-handout.js';
import type { LooseGroup } from '#lib/server/services/bundles.js';
import type {
	ScanGroup,
	ScanGroupUnit,
	ScanKit,
	ScanResult
} from '#lib/server/services/checkout.js';
import type { ListLine } from '#lib/production-list.js';

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
	/** Only where the production is offered as a target — see `listProductions`. */
	checkoutRole?: 'production' | 'lender' | null;
	canCheck?: boolean;
};

export function toProduction(production: ProductionRow): Schemas['Production'] {
	return {
		id: production.id,
		name: production.name,
		startDate: production.startDate?.toISOString() ?? null,
		endDate: production.endDate?.toISOString() ?? null,
		organization: toOrganization(production.organization),
		...(production.checkoutRole !== undefined
			? { checkoutRole: production.checkoutRole ?? ('none' as const) }
			: {}),
		...(production.canCheck !== undefined ? { canCheck: production.canCheck } : {})
	};
}

type CategoryRow = {
	id: string;
	name: string;
	color: string;
	sortOrder: number;
	/** Left out where a stocktake selects only what it shows. */
	inspectionTypes?: { typeId: string }[];
};

export function toCategory(category: CategoryRow): Schemas['Category'] {
	return {
		id: category.id,
		name: category.name,
		color: category.color,
		sortOrder: category.sortOrder,
		...(category.inspectionTypes !== undefined
			? {
					requiresInspection: category.inspectionTypes.some(
						(t) => t.typeId === DEFAULT_INSPECTION_TYPE_ID
					),
					inspectionTypeIds: category.inspectionTypes.map((t) => t.typeId)
				}
			: {})
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
	caption: string | null;
	details: string | null;
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
		caption: product.caption,
		details: product.details,
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

/**
 * A product as the catalog endpoints show it: the ordinary `Product`, plus
 * whether it needs inspecting and how many of the caller's units it has.
 */
export function toCatalogProduct(
	product: ProductRow & {
		isLicense: boolean;
		notInterchangeable: boolean;
		isContainer: boolean;
		inspectionTypes: { typeId: string; required: boolean }[];
		category: { inspectionTypes: { typeId: string }[] };
		ports: {
			count: number;
			label: string | null;
			requirement: string | null;
			connector: { name: string };
		}[];
	},
	extra: {
		mainsConnectors: string[];
		units: Schemas['CatalogProductUnits'];
		/** Every inspection type id, in order. */
		typeIds: string[];
	}
): Schemas['CatalogProduct'] {
	const required = requiredInspectionTypes(product);
	return {
		...toProduct(product),
		requiresInspection: inspectionOverride(product, DEFAULT_INSPECTION_TYPE_ID),
		inspectionRequired: required.has(DEFAULT_INSPECTION_TYPE_ID),
		inspections: extra.typeIds.map((typeId) => ({
			typeId,
			required: required.has(typeId),
			override: inspectionOverride(product, typeId)
		})),
		isLicense: product.isLicense,
		notInterchangeable: product.notInterchangeable,
		isContainer: product.isContainer,
		mainsConnectors: extra.mainsConnectors,
		ports: product.ports.map((p) => ({
			connector: p.connector.name,
			count: p.count,
			label: p.label,
			requirement: portRequirement(p.requirement)
		})),
		units: extra.units
	};
}

export function toProductDocument(document: {
	id: string;
	kind: 'MANUAL' | 'DATASHEET' | 'OTHER';
	title: string;
	path: string;
	sizeBytes: number;
}): Schemas['ProductDocument'] {
	return {
		id: document.id,
		kind: document.kind,
		title: document.title,
		// Always a key under the public prefix, so always an address.
		url: imageSrc(document.path)!,
		sizeBytes: document.sizeBytes
	};
}

type AssetRow = {
	id: string;
	assetTag: string | null;
	serialNumber: string | null;
	orgIndex: number;
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
		orgIndex: asset.orgIndex,
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
	data?: unknown;
};

/** The inspection an INSPECTED or INSPECTION_DELETED entry is about; null for any other. */
function transactionInspection(data: unknown): Schemas['TransactionInspection'] | null {
	const tx = data as TransactionData | null | undefined;
	if (tx?.type === 'INSPECTED') {
		return {
			typeId: tx.inspectionTypeId ?? DEFAULT_INSPECTION_TYPE_ID,
			performedAt: new Date(`${tx.performedAt}T00:00:00.000Z`).toISOString(),
			result: tx.result,
			inspectorName: tx.inspectorName,
			markedBroken: tx.markedBroken
		};
	}
	if (tx?.type === 'INSPECTION_DELETED') {
		return {
			typeId: tx.inspectionTypeId ?? DEFAULT_INSPECTION_TYPE_ID,
			performedAt: new Date(`${tx.performedAt}T00:00:00.000Z`).toISOString(),
			result: tx.result
		};
	}
	return null;
}

/** The other unit and the places of a SWAPPED entry; null for any other. */
function transactionSwap(data: unknown): Schemas['TransactionSwap'] | null {
	const tx = data as TransactionData | null | undefined;
	if (tx?.type !== 'SWAPPED') return null;
	return {
		partnerAssetId: tx.partnerAssetId,
		partnerLabel: tx.partnerLabel,
		now: tx.to?.name ?? null,
		before: tx.from?.name ?? null,
		via: tx.via
	};
}

/** The kits of a KIT_REPLACED entry; null for any other. */
function transactionKitSwap(data: unknown): Schemas['TransactionKitSwap'] | null {
	const tx = data as TransactionData | null | undefined;
	if (tx?.type !== 'KIT_REPLACED') return null;
	return {
		role: tx.role,
		kitName: tx.kit.name,
		otherKitId: tx.otherKit.id,
		otherKitName: tx.otherKit.name
	};
}

export function toAssetTransaction(tx: TransactionRow): Schemas['AssetTransaction'] {
	return {
		id: tx.id,
		action: tx.action,
		createdAt: tx.createdAt.toISOString(),
		userName: tx.user?.name ?? tx.user?.email ?? null,
		productionName: tx.production?.name ?? null,
		inspection: transactionInspection(tx.data),
		swap: transactionSwap(tx.data),
		kitSwap: transactionKitSwap(tx.data)
	};
}

type InspectionRow = {
	id: string;
	assetId: string;
	typeId: string;
	performedAt: Date;
	result: string;
	inspectorName: string | null;
	notes: string | null;
	external: boolean;
	qualification: string | null;
};

export function toInspection(i: InspectionRow): Schemas['Inspection'] {
	return {
		id: i.id,
		assetId: i.assetId,
		typeId: i.typeId,
		performedAt: i.performedAt.toISOString(),
		result: i.result === 'FAILED' ? 'FAILED' : 'PASSED',
		inspectorName: i.inspectorName,
		notes: i.notes,
		external: i.external,
		qualification: i.qualification
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
		createdByName: userLabel(s.createdBy),
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
		productCaption: item.asset.product.caption,
		manufacturerName: item.asset.product.manufacturer?.name ?? null,
		category: toCategory(item.asset.product.category),
		cable: toCableSpec(item.asset.product),
		parentAssetId: item.asset.parentAssetId,
		bundleName: bundle ? bundleLabel(bundle) : null,
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
			productCaption: p.product.caption,
			productImageUrl: imageSrc(p.product.imagePath),
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

/** A unit offered along with a scan, its picture as an address. */
export function toScanGroupUnit(unit: ScanGroupUnit): Schemas['ScanGroupUnit'] {
	return {
		id: unit.id,
		assetTag: unit.assetTag,
		productName: unit.productName,
		productCaption: unit.productCaption,
		manufacturerName: unit.manufacturerName,
		productImageUrl: imageSrc(unit.productImagePath),
		done: unit.done
	};
}

export function toScanGroup(group: ScanGroup | null | undefined): Schemas['ScanGroup'] | null {
	return group
		? { kind: group.kind, name: group.name, units: group.units.map(toScanGroupUnit) }
		: null;
}

export function toScanKit(kit: ScanKit | null | undefined): Schemas['ScanKit'] | null {
	return kit
		? { id: kit.id, name: kit.name, tag: kit.tag, units: kit.units.map(toScanGroupUnit) }
		: null;
}

export function toScanResult(result: ScanResult): Schemas['ScanResult'] {
	return {
		asset: { ...result.asset },
		action: result.action,
		targetName: result.targetName,
		returnedFrom: result.returnedFrom,
		group: toScanGroup(result.group),
		kit: toScanKit(result.kit),
		overdueInspections: (result.overdueInspections ?? []).map((o) => ({ ...o })),
		swap: result.swap ? { ...result.swap } : null,
		kitSwap: result.kitSwap ? { ...result.kitSwap } : null,
		packCase: result.packCase ? toPackCaseRef(result.packCase) : null,
		packedInto: result.packedInto ?? null
	};
}

function toPackCaseRef(ref: ListCaseRef): Schemas['PackCaseRef'] {
	return { assetId: ref.assetId, name: ref.name, tag: ref.tag, orgIndex: ref.orgIndex };
}

/** A unit's or line's pack case — see #lib/pack-cases.ts. */
export function toPackCase(c: ListCase | null | undefined): Schemas['PackCase'] | null {
	return c ? { ...toPackCaseRef(c), path: c.path.map(toPackCaseRef) } : null;
}

function toConfirmEntry(entry: ConfirmEntry): Schemas['StocktakeConfirmEntry'] {
	return {
		assetId: entry.assetId,
		assetTag: entry.assetTag,
		productName: entry.productName,
		productCaption: entry.productCaption,
		manufacturerName: entry.manufacturerName,
		productImageUrl: imageSrc(entry.productImagePath),
		foundByName: entry.foundByName
	};
}

export function toStocktakeScanResult(
	result: StocktakeScanOutcome,
	closed: boolean,
	userId: string
): Schemas['StocktakeScanResult'] {
	if (result.outcome === 'bundle') {
		return {
			outcome: 'bundle',
			item: null,
			bundle: result.bundle,
			confirm: result.confirm.map(toConfirmEntry)
		};
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
		confirm: result.confirm.map(toConfirmEntry),
		confirmGroup: result.confirmGroup
	};
}

export function toCaseCheck(check: CaseCheck, scannedAssetId: string | null): Schemas['CaseCheck'] {
	return {
		kind: check.kind,
		id: check.id,
		tag: check.tag,
		name: check.name,
		checkedOutTo: check.checkedOutTo,
		items: check.items.map((i) => ({
			assetId: i.assetId,
			assetTag: i.assetTag,
			serialNumber: i.serialNumber,
			orgIndex: i.orgIndex,
			name: i.name,
			caption: i.caption,
			accessoryOf: i.accessoryOf,
			awayOn: i.awayOn,
			innerKit: i.innerKit
		})),
		shortOfType: check.shortOfType.map((l) => ({ name: l.name, missing: l.missing })),
		lastCheck: check.lastCheck && {
			at: check.lastCheck.at.toISOString(),
			userName: check.lastCheck.userName,
			found: check.lastCheck.found,
			expected: check.lastCheck.expected
		},
		canRecord: check.canRecord,
		scannedAssetId
	};
}

export function toProductionCheck(check: ProductionCheckView): Schemas['ProductionCheck'] {
	return {
		id: check.id,
		status: check.status,
		productionId: check.productionId,
		productionName: check.productionName,
		side: {
			organizationId: check.side.organizationId,
			organizationName: check.side.organizationName,
			own: check.side.own
		},
		createdAt: check.createdAt.toISOString(),
		createdBy: check.createdBy,
		closedAt: check.closedAt?.toISOString() ?? null,
		closedBy: check.closedBy,
		items: check.items.map((i) => ({
			assetId: i.assetId,
			assetTag: i.assetTag,
			productName: i.productName,
			productCaption: i.productCaption,
			manufacturerName: i.manufacturerName,
			productImageUrl: imageSrc(i.productImagePath),
			lentBy: i.lentBy,
			ownerOrgId: i.ownerOrgId,
			lengthCm: i.lengthCm,
			accessoryOf: i.accessoryOf,
			group: { kind: i.group.kind, name: i.group.name },
			kit: i.kit && { ...i.kit },
			packCase: toPackCase(i.packCase),
			isPackCase: i.isPackCase,
			status: i.status,
			received: i.received,
			returnReported: i.returnReported,
			tick: i.tick && {
				userName: i.tick.userName,
				mine: i.tick.mine,
				via: i.tick.via,
				at: i.tick.at.toISOString()
			}
		})),
		lines: check.lines.map(toListLine),
		unexpected: check.unexpected.map((u) => ({
			assetId: u.assetId,
			assetTag: u.assetTag,
			productName: u.productName,
			userName: u.userName,
			mine: u.mine
		})),
		canConfirmReceipt: check.canConfirmReceipt,
		canReportReturn: check.canReportReturn
	};
}

export function toListLine(line: ListLine): Schemas['ProductionListLine'] {
	return {
		key: line.key,
		productName: line.productName,
		productCaption: line.productCaption,
		manufacturerName: line.manufacturerName,
		productImageUrl: imageSrc(line.productImagePath),
		lentBy: line.lentBy,
		...(line.ownerOrgId ? { ownerOrgId: line.ownerOrgId } : {}),
		lengthCm: line.lengthCm ?? null,
		group: { kind: line.group.kind, name: line.group.name },
		assetIds: line.assetIds,
		total: line.total,
		done: line.done,
		floor: line.floor,
		packCase: toPackCase(line.packCase)
	};
}

export function toProductionHandout(view: HandoutView): Schemas['ProductionHandout'] {
	return {
		mode: view.mode,
		productionId: view.productionId,
		productionName: view.productionName,
		cancelled: view.cancelled,
		side: { ...view.side },
		sides: view.sides.map((side) => ({ ...side })),
		items: view.items.map((i) => ({
			assetId: i.assetId,
			assetTag: i.assetTag,
			productName: i.productName,
			productCaption: i.productCaption,
			manufacturerName: i.manufacturerName,
			productImageUrl: imageSrc(i.productImagePath),
			lentBy: i.lentBy,
			ownerOrgId: i.ownerOrgId,
			lengthCm: i.lengthCm,
			accessoryOf: i.accessoryOf,
			group: { kind: i.group.kind, name: i.group.name },
			kit: i.kit && { ...i.kit },
			kitAddition: i.kitAddition,
			packCase: toPackCase(i.packCase),
			isPackCase: i.isPackCase,
			status: i.status,
			done: i.done,
			received: i.received,
			returnReported: i.returnReported,
			inspectionOverdue: i.inspectionOverdue
		})),
		lines: view.lines.map(toListLine),
		othersCount: view.othersCount
	};
}

export function toManufacturer(manufacturer: {
	id: string;
	name: string;
	_count: { products: number };
}): Schemas['Manufacturer'] {
	return {
		id: manufacturer.id,
		name: manufacturer.name,
		productCount: manufacturer._count.products
	};
}

export function toConnector(
	connector: { id: string; name: string; family: string | null; mains: boolean },
	productCount: number
): Schemas['Connector'] {
	return {
		name: connector.name,
		family: connector.family,
		mains: connector.mains,
		productCount
	};
}

// ── Bundles ─────────────────────────────────────────────────────────────────

type KitRefRow = {
	id: string;
	tag: string | null;
	template: { name: string; caption: string | null };
};

export function toKitRef(kit: KitRefRow): Schemas['KitRef'] {
	return { id: kit.id, name: withCaption(kit.template.name, kit.template.caption), tag: kit.tag };
}

type BundleSummaryRow = {
	id: string;
	tag: string | null;
	imagePath: string | null;
	location: { id: string; name: string } | null;
	parentBundle: KitRefRow | null;
	template: {
		name: string;
		caption: string | null;
		organizationId: string;
		category: { name: string };
	};
};

export function toBundleSummary(
	bundle: BundleSummaryRow,
	unitCount: number
): Schemas['BundleSummary'] {
	return {
		id: bundle.id,
		name: bundle.template.name,
		caption: bundle.template.caption,
		tag: bundle.tag,
		imageUrl: imageSrc(bundle.imagePath),
		categoryName: bundle.template.category.name,
		organizationId: bundle.template.organizationId,
		location: bundle.location ? { id: bundle.location.id, name: bundle.location.name } : null,
		unitCount,
		parentBundle: bundle.parentBundle ? toKitRef(bundle.parentBundle) : null
	};
}

type BundleUnitRow = {
	id: string;
	assetTag: string | null;
	serialNumber: string | null;
	orgIndex: number;
	status: string;
	parentAssetId: string | null;
	product: {
		id: string;
		name: string;
		caption: string | null;
		imagePath: string | null;
		lengthCm: number | null;
		manufacturer: { name: string } | null;
	};
	location: { id: string; name: string };
	productionItems: { production: { name: string } }[];
};

function toBundleUnit(unit: BundleUnitRow): Schemas['BundleUnit'] {
	return {
		id: unit.id,
		assetTag: unit.assetTag,
		serialNumber: unit.serialNumber,
		orgIndex: unit.orgIndex,
		status: unit.status,
		parentAssetId: unit.parentAssetId,
		productId: unit.product.id,
		productName: unit.product.name,
		productCaption: unit.product.caption,
		manufacturerName: unit.product.manufacturer?.name ?? null,
		productImageUrl: imageSrc(unit.product.imagePath),
		lengthCm: unit.product.lengthCm,
		location: { id: unit.location.id, name: unit.location.name },
		checkedOutTo: unit.productionItems[0]?.production.name ?? null
	};
}

type InnerBundleRow = KitRefRow & { imagePath: string | null; unitCount: number };

export function toBundleDetail(
	bundle: BundleSummaryRow & {
		assets: BundleUnitRow[];
		innerBundles: InnerBundleRow[];
		canEdit: boolean;
		caseUnitId: string | null;
		number: { code: string | null; fromCase: boolean };
		extraCases: number;
	}
): Schemas['BundleDetail'] {
	const units = bundle.assets.filter((a) => !a.parentAssetId);
	const byName = (a: BundleUnitRow, b: BundleUnitRow) =>
		naturalCompare(a.product.name, b.product.name) ||
		naturalCompare(a.assetTag ?? '', b.assetTag ?? '');
	// Each unit followed by what hangs off it, the way the case is packed.
	const ordered = units
		.sort(byName)
		.flatMap((unit) => [
			unit,
			...bundle.assets.filter((a) => a.parentAssetId === unit.id).sort(byName)
		]);
	return {
		...toBundleSummary(bundle, units.length),
		units: ordered.map(toBundleUnit),
		innerBundles: bundle.innerBundles.map((kit) => ({
			id: kit.id,
			name: kit.template.name,
			caption: kit.template.caption,
			tag: kit.tag,
			imageUrl: imageSrc(kit.imagePath),
			unitCount: kit.unitCount
		})),
		canEdit: bundle.canEdit,
		caseUnitId: bundle.caseUnitId,
		number: bundle.number.code,
		numberFromCase: bundle.number.fromCase,
		extraCases: bundle.extraCases
	};
}

export function toLooseGroup(group: LooseGroup): Schemas['LooseGroup'] {
	return {
		key: group.key,
		productId: group.productId,
		locationId: group.locationId,
		productName: group.productName,
		productCaption: group.productCaption,
		productImageUrl: imageSrc(group.productImagePath),
		manufacturerName: group.manufacturerName,
		locationName: group.locationName,
		available: group.available,
		untagged: group.untagged
	};
}

export function toHandoutAddition(candidate: HandoutCandidate): Schemas['HandoutAddition'] {
	return {
		key: candidate.key,
		productId: candidate.productId,
		organizationId: candidate.organizationId,
		locationId: candidate.locationId,
		productName: candidate.productName,
		productCaption: candidate.productCaption,
		productImageUrl: imageSrc(candidate.productImagePath),
		manufacturerName: candidate.manufacturerName,
		locationName: candidate.locationName,
		organizationName: candidate.organizationName,
		available: candidate.available,
		untagged: candidate.untagged
	};
}
