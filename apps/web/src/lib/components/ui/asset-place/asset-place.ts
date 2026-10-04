/**
 * Where a unit is, for a list's Location column: the production it is
 * checked out to while it is out, otherwise its shelf. A row that stands for
 * several units names the place they share, or is `mixed`.
 */
export type Place =
	| { kind: 'location'; name: string }
	| { kind: 'production'; name: string; productionId: string | null; home: string | null }
	| { kind: 'mixed' }
	| null;

type Placed = {
	location: { name: string } | null;
	checkedOutTo?: { productionId: string | null; name: string } | null;
};

export function placeOf(unit: Placed): Place {
	if (unit.checkedOutTo) {
		return {
			kind: 'production',
			name: unit.checkedOutTo.name,
			productionId: unit.checkedOutTo.productionId,
			home: unit.location?.name ?? null
		};
	}
	return unit.location ? { kind: 'location', name: unit.location.name } : null;
}

// Units nobody has placed yet don't make the rest mixed. Units out on one
// production share it even if they come from different shelves, so the
// shelf only counts when it is the same for all of them.
export function sharedPlace(units: Placed[]): Place {
	const places = units.map(placeOf).filter((p) => p !== null);
	if (places.length === 0) return null;
	const [first, ...rest] = places;
	if (first.kind === 'location') {
		return rest.every((p) => p.kind === 'location' && p.name === first.name)
			? first
			: { kind: 'mixed' };
	}
	if (first.kind === 'production') {
		if (!rest.every((p) => p.kind === 'production' && p.name === first.name))
			return { kind: 'mixed' };
		const homes = new Set(places.map((p) => (p.kind === 'production' ? p.home : null)));
		return homes.size === 1 ? first : { ...first, home: null };
	}
	return first;
}
