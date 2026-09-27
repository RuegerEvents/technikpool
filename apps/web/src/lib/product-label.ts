/**
 * What a product is called wherever it is named in full: "Shure SM58", or just
 * "Kaltgerätekabel" for a product nobody makes in particular. The one place the
 * maker and the name are joined, so a missing maker never leaves a gap or a
 * placeholder on a delivery note.
 */
export function productLabel(product: {
	name: string;
	manufacturer: { name: string } | null;
}): string {
	return makerAndName(product.manufacturer?.name, product.name);
}

/** `productLabel` for rows that carry the maker as a flat `manufacturerName`. */
export function makerAndName(manufacturerName: string | null | undefined, name: string): string {
	return manufacturerName ? `${manufacturerName} ${name}` : name;
}

/**
 * A product or kit named with its caption: "USW-Pro-Max-16-PoE — 16-port PoE
 * switch". The caption explains the name rather than replacing it — the name is
 * still what is on the box.
 */
export function withCaption(name: string, caption: string | null | undefined): string {
	return caption ? `${name} — ${caption}` : name;
}

/** A case named for a list read out loud: "Router Kit XL — FOH Rack (K-03)". */
export function bundleLabel(bundle: {
	tag: string | null;
	template: { name: string; caption: string | null };
}): string {
	const name = withCaption(bundle.template.name, bundle.template.caption);
	return bundle.tag ? `${name} (${bundle.tag})` : name;
}
