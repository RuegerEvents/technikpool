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

type AccessoryItem = {
	id: string;
	status: string;
	asset: { productId: string; assetTag: string | null };
};

export type AccessoryLine<T> = { key: string; item: T; count: number; differs: boolean };

/**
 * A unit's accessories as lines of their own, each with its status. Untagged
 * ones of one product and status are told apart by nothing, so they share a
 * line ("2× Omega Bracket"); a tagged one keeps its own. `differs` marks an
 * accessory that is not where its unit is — still APPROVED while the unit is
 * out, say — which is the thing a summary line used to hide.
 */
export function accessoryLines<T extends AccessoryItem>(
	parentStatus: string,
	accessories: T[]
): AccessoryLine<T>[] {
	const lines: AccessoryLine<T>[] = [];
	for (const item of accessories) {
		const shared =
			item.asset.assetTag === null
				? lines.find(
						(l) =>
							l.item.asset.assetTag === null &&
							l.item.asset.productId === item.asset.productId &&
							l.item.status === item.status
					)
				: undefined;
		if (shared) shared.count++;
		else lines.push({ key: item.id, item, count: 1, differs: item.status !== parentStatus });
	}
	return lines;
}

/** How many of these units' accessories are not in their unit's status. */
export function divergentAccessoryCount(
	units: { status: string; accessories: { status: string }[] }[]
): number {
	return units.reduce(
		(sum, u) => sum + u.accessories.filter((a) => a.status !== u.status).length,
		0
	);
}

export type DraftLender = { id: string; name: string; shortName: string | null; units: number };

/**
 * Other orgs' units noted on a production but not asked for yet (DRAFT), per
 * lender — what "Request…" sends. Counted as units: an accessory travels
 * inside its parent.
 */
export function draftLenders(
	items: (NestableItem & {
		status: string;
		asset: { organization: { id: string; name: string; shortName: string | null } };
	})[]
): DraftLender[] {
	const byOrg = new Map<string, DraftLender>();
	for (const unit of nestAccessories(items.filter((i) => i.status === 'DRAFT'))) {
		const org = unit.asset.organization;
		const entry = byOrg.get(org.id);
		if (entry) entry.units++;
		else byOrg.set(org.id, { id: org.id, name: org.name, shortName: org.shortName, units: 1 });
	}
	return [...byOrg.values()];
}
