/**
 * A cable's ends as everything above the database reads them: names.
 *
 * The rows hold only `connectorAId/BId`, so that a connector's name has one
 * home and a rename reaches every cable. But the forms, `$lib/cable`, the
 * device list and the API's `CableSpec` all work in names, so a read loads the
 * two connectors with `CABLE_ENDS` and hands them on flattened by
 * `withCableNames` — `connectorA: 'XLR3 M'`, exactly the shape the columns
 * used to have.
 *
 * `$lib/cable` requires `connectorA/B` on everything it takes, so a query that
 * forgets the include fails `pnpm check` rather than showing a cable without
 * ends.
 */

const END_NAME = { select: { name: true } } as const;

/** A loom's ways, in the order they were entered, with their ends. */
export const CABLE_WAYS = {
	orderBy: { sortOrder: 'asc' },
	include: { connectorARef: END_NAME, connectorBRef: END_NAME }
} as const;

/** Spread into a product `include`: both ends and the ways. */
export const CABLE_ENDS = {
	connectorARef: END_NAME,
	connectorBRef: END_NAME,
	ways: CABLE_WAYS
} as const;

type EndRefs = {
	connectorARef: { name: string } | null;
	connectorBRef: { name: string } | null;
};

export type WithEndNames<T extends EndRefs> = Omit<T, 'connectorARef' | 'connectorBRef'> & {
	connectorA: string | null;
	connectorB: string | null;
};

/** One row's ends — a product's or a way's — as names. */
export function withEndNames<T extends EndRefs>(row: T): WithEndNames<T> {
	const { connectorARef, connectorBRef, ...rest } = row;
	return {
		...rest,
		connectorA: connectorARef?.name ?? null,
		connectorB: connectorBRef?.name ?? null
	};
}

type CableRow = EndRefs & { ways: EndRefs[] };

export type WithCableNames<T extends CableRow> = Omit<WithEndNames<T>, 'ways'> & {
	ways: WithEndNames<T['ways'][number]>[];
};

/** A product loaded with `CABLE_ENDS`, its ends and its ways' ends as names. */
export function withCableNames<T extends CableRow>(product: T): WithCableNames<T> {
	return { ...withEndNames(product), ways: product.ways.map((w) => withEndNames(w)) };
}

type AssetRow = { product: CableRow; accessories: { product: CableRow }[] };
type Accessory<A extends AssetRow> = A['accessories'][number];

export type AssetWithCableNames<A extends AssetRow> = Omit<A, 'product' | 'accessories'> & {
	product: WithCableNames<A['product']>;
	accessories: (Omit<Accessory<A>, 'product'> & {
		product: WithCableNames<Accessory<A>['product']>;
	})[];
};

/**
 * A unit and its accessories, each with its product's ends as names — the
 * shape every asset query that includes `ACCESSORIES_INCLUDE` returns.
 */
export function assetWithCableNames<A extends AssetRow>(asset: A): AssetWithCableNames<A> {
	return {
		...asset,
		product: withCableNames(asset.product),
		accessories: asset.accessories.map((accessory) => ({
			...accessory,
			product: withCableNames(accessory.product)
		}))
	} as unknown as AssetWithCableNames<A>;
}

/** A row carrying a product — a unit in a bundle, say — with its ends as names. */
export function withProductCableNames<R extends { product: CableRow }>(
	row: R
): Omit<R, 'product'> & { product: WithCableNames<R['product']> } {
	return { ...row, product: withCableNames(row.product) };
}
