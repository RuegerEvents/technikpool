/**
 * What a bundle *type* holds, and how a given case measures up to it.
 *
 * Two cases of "32A Distro Kit" are the same kit: the same products, the same
 * number of each. That is what makes a bundle bookable as one thing — a
 * production that asks for the kit must get the same gear whichever case is
 * free. So the type carries a spec, and every instance is measured against it.
 *
 * The spec is not stored: it is read off the instances themselves, one line per
 * product at the highest count any instance holds of it (see
 * `bundleTypeSpec` in `server/services/bundle-spec.ts`). A case that is short
 * of something is *incomplete*, not a new kind of kit — which is exactly what a
 * kit with a fixture away for repair is.
 *
 * The comparing is in here, free of Prisma and of the server, because both
 * sides do it: the server to refuse a case that doesn't match, and the two
 * pickers to offer only what still fits.
 */

/** One product the type holds, and how many of it. */
export type BundleSpecLine = {
	productId: string;
	name: string;
	manufacturerName: string | null;
	quantity: number;
};

/** A bundle type's composition, and how many cases it was read from. */
export type BundleTypeSpec = {
	templateId: string;
	/** Cases of this type that exist. With fewer than two, `lines` is empty. */
	instanceCount: number;
	lines: BundleSpecLine[];
};

/** How many of each product a case holds — or a selection is about to. */
export function countProducts(members: Iterable<{ productId: string }>) {
	const counts = new Map<string, number>();
	for (const { productId } of members) counts.set(productId, (counts.get(productId) ?? 0) + 1);
	return counts;
}

/** Per line of the spec: how many are here, and how many are still missing. */
export function specShortfall(lines: BundleSpecLine[], counts: Map<string, number>) {
	return lines.map((line) => {
		const have = counts.get(line.productId) ?? 0;
		return { line, have, missing: Math.max(0, line.quantity - have) };
	});
}

/** Room left for one more of this product before the type is exceeded. */
export function roomFor(lines: BundleSpecLine[], counts: Map<string, number>, productId: string) {
	const line = lines.find((l) => l.productId === productId);
	if (!line) return 0;
	return Math.max(0, line.quantity - (counts.get(productId) ?? 0));
}

/** What is held that the type has no room for — a foreign product, or too many. */
export function specSurplus(lines: BundleSpecLine[], counts: Map<string, number>) {
	const quantities = new Map(lines.map((line) => [line.productId, line.quantity]));
	return [...counts]
		.map(([productId, count]) => ({ productId, extra: count - (quantities.get(productId) ?? 0) }))
		.filter(({ extra }) => extra > 0);
}

/** Exactly the type's products, in exactly its numbers. */
export function matchesSpec(lines: BundleSpecLine[], counts: Map<string, number>) {
	return (
		specShortfall(lines, counts).every(({ missing }) => missing === 0) &&
		specSurplus(lines, counts).length === 0
	);
}
