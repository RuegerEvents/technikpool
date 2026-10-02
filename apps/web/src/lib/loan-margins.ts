// What the production's own org earns on the equipment it borrowed, line by
// line: what a document charges for it, after the document's discount, set
// against what the lender charges (`getLoanCosts`). Worked out here, from the
// document's items as they are on screen, so a changed rate or discount moves
// the margin at once — the server only knows the lender's side.

export type LoanCostEntry = {
	/** The unit's asset id, or `bundle:<id>` for a kit billed as one line. */
	key: string;
	lenderName: string;
	free: boolean;
	units: number;
	/** Null while the lender has sent neither an offer nor an invoice. */
	cost: number | null;
};

export type LoanLine = {
	lenderName: string;
	free: boolean;
	cost: number | null;
	revenue: number;
};

type Item = {
	id: string;
	kind?: string;
	assetId?: string | null;
	bundleId?: string | null;
	lineTotal: unknown;
};

export function loanMargins(items: Item[], entries: LoanCostEntry[], factor: number) {
	const byKey = new Map(entries.map((e) => [e.key, e]));
	const lines = new Map<string, LoanLine>();
	const billed = new Set<string>();
	for (const item of items) {
		if (item.kind === 'SERVICE') continue;
		const key = item.bundleId ? `bundle:${item.bundleId}` : (item.assetId ?? null);
		const entry = key ? byKey.get(key) : undefined;
		if (!entry) continue;
		billed.add(entry.key);
		lines.set(item.id, {
			lenderName: entry.lenderName,
			free: entry.free,
			cost: entry.cost,
			revenue: Number(item.lineTotal) * factor
		});
	}
	const all = [...lines.values()];
	const known = all.filter((l) => l.cost !== null);
	// Lent and not passed on: the document charges nothing for it, the lender may.
	const unbilled = entries.filter((e) => !billed.has(e.key) && !e.free);
	return {
		lines,
		revenue: known.reduce((sum, l) => sum + l.revenue, 0),
		cost: known.reduce((sum, l) => sum + l.cost!, 0),
		/** Lines whose lender has not said what they cost yet. */
		open: all.length - known.length,
		unbilled: {
			units: unbilled.reduce((sum, e) => sum + e.units, 0),
			cost: unbilled.reduce((sum, e) => sum + (e.cost ?? 0), 0),
			open: unbilled.filter((e) => e.cost === null).length
		}
	};
}
