/**
 * What a bundle *type* holds, and how a given case measures up to it.
 *
 * Two cases of "32A Distro Kit" are the same kit: the same products, the same
 * number of each. That is what makes a bundle bookable as one thing — a
 * production that asks for the kit must get the same gear whichever case is
 * free. So the type carries a spec, and every instance is measured against it.
 *
 * The spec is not stored: it is read off the instances themselves, one line per
 * product — and one per bundle type of the kits nested inside — at the highest
 * count any instance holds of it (see
 * `bundleTypeSpec` in `server/services/bundle-spec.ts`). A case that is short
 * of something is *incomplete*, not a new kind of kit — which is exactly what a
 * kit with a fixture away for repair is.
 *
 * The comparing is in here, free of Prisma and of the server, because both
 * sides do it: the server to refuse a case that doesn't match, and the two
 * pickers to offer only what still fits.
 */

/**
 * One product the type holds, or one bundle type of the kits it holds inside
 * ("1× PowerCon-Set" in the FOH case), and how many of it.
 */
export type BundleSpecLine = {
	kind: 'product' | 'bundle';
	/**
	 * What a line is counted under: the product's id, or `bundleKey` of the
	 * inner kit's type — the two can never collide.
	 */
	key: string;
	/** The product, on a product line; null on a bundle line. */
	productId: string | null;
	/** The inner kits' bundle type, on a bundle line; null on a product line. */
	templateId: string | null;
	name: string;
	manufacturerName: string | null;
	imagePath: string | null;
	quantity: number;
};

/** A bundle type's composition, and how many cases it was read from. */
export type BundleTypeSpec = {
	templateId: string;
	/** Cases of this type that exist. With fewer than two, `lines` is empty. */
	instanceCount: number;
	lines: BundleSpecLine[];
};

/** The key a bundle type's line is counted under, next to product ids. */
export function bundleKey(templateId: string) {
	return `bundle:${templateId}`;
}

/**
 * How many of each product a case holds — or a selection is about to — and,
 * with `innerKits`, how many kits of each bundle type sit inside it. Keyed
 * like `BundleSpecLine.key`.
 */
export function countProducts(
	members: Iterable<{ productId: string }>,
	innerKits: Iterable<{ templateId: string }> = []
) {
	const counts = new Map<string, number>();
	for (const { productId } of members) counts.set(productId, (counts.get(productId) ?? 0) + 1);
	for (const { templateId } of innerKits) {
		const key = bundleKey(templateId);
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	return counts;
}

/** Per line of the spec: how many are here, and how many are still missing. */
export function specShortfall(lines: BundleSpecLine[], counts: Map<string, number>) {
	return lines.map((line) => {
		const have = counts.get(line.key) ?? 0;
		return { line, have, missing: Math.max(0, line.quantity - have) };
	});
}

/** Room left for one more of this product (or `bundleKey`) before the type is exceeded. */
export function roomFor(lines: BundleSpecLine[], counts: Map<string, number>, key: string) {
	const line = lines.find((l) => l.key === key);
	if (!line) return 0;
	return Math.max(0, line.quantity - (counts.get(key) ?? 0));
}

/** What is held that the type has no room for — a foreign product or kit, or too many. */
export function specSurplus(lines: BundleSpecLine[], counts: Map<string, number>) {
	const quantities = new Map(lines.map((line) => [line.key, line.quantity]));
	return [...counts]
		.map(([key, count]) => ({ key, extra: count - (quantities.get(key) ?? 0) }))
		.filter(({ extra }) => extra > 0);
}

/** Exactly the type's products, in exactly its numbers. */
export function matchesSpec(lines: BundleSpecLine[], counts: Map<string, number>) {
	return (
		specShortfall(lines, counts).every(({ missing }) => missing === 0) &&
		specSurplus(lines, counts).length === 0
	);
}
