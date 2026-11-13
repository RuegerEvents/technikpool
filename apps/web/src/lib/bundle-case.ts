// A fixed bundle's case: the container unit (Product.isContainer) inside it —
// the Flyht Pro WP Safe Box of the Command Wing kit. Its tag is the bundle's
// number, so scanning it means the whole kit wherever the bundle's own tag
// would (`kitByTag` in services/asset-lookup.ts). A bundle without one keeps
// its own optional tag, or has no code at all (a DMX ring). A container in no
// bundle is a pack case instead — see #lib/pack-cases.ts. Pure; the database
// half is `bundleByCode` / `bundleCaseOf`.

export type CaseCandidate = { orgIndex: number; isContainer: boolean };

/**
 * The unit that is the bundle's case among its own units: its container, or
 * with two of them the lowest unit number. Null without one.
 */
export function bundleCaseUnit<T extends CaseCandidate>(units: T[]): T | null {
	let best: T | null = null;
	for (const unit of units) {
		if (unit.isContainer && (!best || unit.orgIndex < best.orgIndex)) best = unit;
	}
	return best;
}

/** More than one container in the bundle: only the lowest-numbered is its case. */
export function extraCases(units: CaseCandidate[]) {
	return Math.max(0, units.filter((u) => u.isContainer).length - 1);
}

/**
 * The bundle's number as printed and shown: its own tag when it has one,
 * else its case's tag, else none. `fromCase` says the number is the case's.
 */
export function bundleNumber(
	bundle: { tag: string | null },
	caseUnit: { assetTag: string | null } | null
): { code: string | null; fromCase: boolean } {
	if (bundle.tag) return { code: bundle.tag, fromCase: false };
	const code = caseUnit?.assetTag ?? null;
	return { code, fromCase: code !== null };
}

/**
 * Whether a scanned unit stands for its whole kit: it is the case of the
 * bundle it is in. A container in a bundle always does — booking only the
 * empty case is taking it out of the bundle first.
 */
export function unitMeansKit(
	unit: { id: string; bundleId: string | null; isContainer: boolean },
	caseUnitId: string | null
) {
	return unit.isContainer && unit.bundleId !== null && unit.id === caseUnitId;
}
