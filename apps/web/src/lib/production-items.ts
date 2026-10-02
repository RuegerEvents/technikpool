// An accessory travels with its parent, so it has a ProductionItem of its own —
// the unique constraint on (productionId, assetId) needs one, and a scan of the
// cable has to find something to check out. But nowhere in the UI is it a line
// of its own: it renders as an indented sub-line under the unit it is bolted to.
//
// The nesting is derived here rather than stored, from exactly the condition
// that makes it true: this item's asset has a parent, and that parent is booked
// on this same production. An accessory whose parent is *not* here (booked
// before it was attached, or the parent removed since) stays a top-level line,
// because nothing else is representing it.

/** The shape both the production detail page and the print routes have on hand. */
type NestableItem = {
	assetId: string;
	sourceParentAssetId?: string | null;
	asset: { parentAssetId: string | null };
};

export type Nested<T> = T & { accessories: T[] };

export function nestAccessories<T extends NestableItem>(items: T[]): Nested<T>[] {
	const parentIds = new Set(items.map((item) => item.assetId));
	const parentOf = (item: T) => item.sourceParentAssetId ?? item.asset.parentAssetId;
	const isNested = (item: T) => parentOf(item) !== null && parentIds.has(parentOf(item)!);

	const byParent = new Map<string, T[]>();
	for (const item of items) {
		if (!isNested(item)) continue;
		const parentId = parentOf(item)!;
		const list = byParent.get(parentId);
		if (list) list.push(item);
		else byParent.set(parentId, [item]);
	}

	return items
		.filter((item) => !isNested(item))
		.map((item) => ({ ...item, accessories: byParent.get(item.assetId) ?? [] }));
}

/** "2× Omega Bracket · 1× Kaltgerätekabel" — the sub-line's whole text. */
export function accessorySummary(accessories: { asset: { product: { name: string } } }[]): string {
	const counts = new Map<string, number>();
	for (const { asset } of accessories) {
		counts.set(asset.product.name, (counts.get(asset.product.name) ?? 0) + 1);
	}
	return [...counts.entries()].map(([name, count]) => `${count}× ${name}`).join(' · ');
}
