import { naturalCompare } from '#lib/sort.js';

// Pack cases (Transflex & Co.): ordinary units whose product is a pack
// container, holding what was packed into them for one production. The
// assignment is on the booking (`ProductionItem.packedInItemId`), so this
// module only ever sees a production's items. Pure, shared by the server that
// builds the lists and sheets and by the page that draws them; the database
// half is in services/pack-cases.ts.

/** A pack case as a list names it: its product, and its tag or number. */
export interface ListCaseRef {
	assetId: string;
	/** The product's name with its caption — "Transflex 60×40". */
	name: string;
	tag: string | null;
	/** The unit's number in its org, for a case without a tag. */
	orgIndex: number;
}

/**
 * The case a unit is listed under, with the cases around it: `path` runs from
 * the outermost case down to the one this case sits in, empty for a case
 * packed in nothing.
 */
export interface ListCase extends ListCaseRef {
	path: ListCaseRef[];
}

/**
 * A unit is a pack case when its product is a container and it is in no
 * fixed bundle — in one, the container is that bundle's case instead and its
 * tag the bundle's number (#lib/bundle-case.ts).
 */
export function isPackCaseUnit(asset: {
	bundleId: string | null;
	product: { isContainer: boolean };
}) {
	return asset.product.isContainer && asset.bundleId === null;
}

/** "3", or "#12" for a case without a tag. */
export function caseNumber(c: ListCaseRef) {
	return c.tag ?? `#${c.orgIndex}`;
}

/** "3 (Transflex 60×40)" — the caller puts "Kiste" or "Case" in front. */
export function caseTitle(c: ListCaseRef) {
	return `${caseNumber(c)} (${c.name})`;
}

/** The case and every case around it, outermost first. */
export function caseChain(c: ListCase): ListCaseRef[] {
	return [...c.path, c];
}

/** Whether `c` is the case `caseAssetId` or sits somewhere inside it. */
export function withinCase(c: ListCase | null | undefined, caseAssetId: string) {
	return !!c && caseChain(c).some((ref) => ref.assetId === caseAssetId);
}

/**
 * Cases in the order a list shows them: by their chains, element by element,
 * so a case inside another follows right after it (and after any case that
 * sorts before it inside the same one).
 */
export function compareCases(a: ListCase, b: ListCase) {
	const ca = caseChain(a);
	const cb = caseChain(b);
	for (let i = 0; i < Math.min(ca.length, cb.length); i++) {
		const by =
			naturalCompare(caseNumber(ca[i]), caseNumber(cb[i])) ||
			naturalCompare(ca[i].name, cb[i].name) ||
			naturalCompare(ca[i].assetId, cb[i].assetId);
		if (by) return by;
	}
	return ca.length - cb.length;
}

/** One item of a production, as far as packing is concerned. */
export interface PackNode {
	itemId: string;
	packedInItemId: string | null;
	/** Its product is a pack container. */
	isPackCase: boolean;
	ref: ListCaseRef;
}

/**
 * Every case on the production with the cases around it, by item id. A link to
 * an item that is not a case (its product lost the flag since) or not on the
 * production counts as none. A circle cannot be stored through `packInto`, but
 * if one were, the walk stops where it closes.
 */
export function casePaths(nodes: PackNode[]): Map<string, ListCase> {
	const byItem = new Map(nodes.map((n) => [n.itemId, n]));
	const outerOf = (n: PackNode) => {
		const outer = n.packedInItemId ? byItem.get(n.packedInItemId) : undefined;
		return outer?.isPackCase ? outer : undefined;
	};
	const cases = new Map<string, ListCase>();
	for (const node of nodes) {
		if (!node.isPackCase) continue;
		const path: ListCaseRef[] = [];
		const seen = new Set([node.itemId]);
		for (let outer = outerOf(node); outer && !seen.has(outer.itemId); outer = outerOf(outer)) {
			seen.add(outer.itemId);
			path.unshift(outer.ref);
		}
		cases.set(node.itemId, { ...node.ref, path });
	}
	return cases;
}

/**
 * The case an item is listed under: a case under itself — its own row heads
 * its section — anything else under the case it is packed in. Null: loose.
 */
export function sectionCaseOf(node: PackNode, cases: Map<string, ListCase>): ListCase | null {
	if (node.isPackCase) return cases.get(node.itemId) ?? null;
	return (node.packedInItemId && cases.get(node.packedInItemId)) || null;
}

export type PackRefusal = 'not_a_case' | 'into_itself' | 'circle';

/**
 * Why `moving` (item ids) may not go into the case `target`: it is no case, it
 * is one of them, or it sits inside one of them — the circle a case inside its
 * own content would make. `outerOf` is each item's case.
 */
export function packRefusal(
	moving: string[],
	target: { itemId: string; isPackCase: boolean },
	outerOf: (itemId: string) => string | null
): PackRefusal | null {
	if (!target.isPackCase) return 'not_a_case';
	const ids = new Set(moving);
	if (ids.has(target.itemId)) return 'into_itself';
	const seen = new Set<string>();
	for (let at = outerOf(target.itemId); at && !seen.has(at); at = outerOf(at)) {
		if (ids.has(at)) return 'circle';
		seen.add(at);
	}
	return null;
}

/**
 * Which units of a counted line go into a case when only `count` of them do.
 * The line's units are interchangeable, so it splits: the part packed becomes a
 * line of its own under the case (a line's key carries its case), the rest
 * stays where it was. Units already out go first — they are on the table being
 * packed — then the rest, each in the line's own order (lowest number first).
 */
export function pickToPack(
	assetIds: string[],
	count: number,
	isDone: (assetId: string) => boolean
) {
	const n = Math.max(0, Math.min(assetIds.length, Math.round(count)));
	return [...assetIds.filter(isDone), ...assetIds.filter((id) => !isDone(id))].slice(0, n);
}
