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
