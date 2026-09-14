// Offer revisions point at the first version, so `originalOfferId ?? id` names
// the offer they are all versions of. Client-safe: the offer lists use it to
// tell which rows a later revision has replaced.

type VersionedOffer = { id: string; originalOfferId: string | null; revision: number };

export function offerFamilyId(offer: VersionedOffer): string {
	return offer.originalOfferId ?? offer.id;
}

/** The offers in `offers` that a higher revision in the same list replaces. */
export function supersededOfferIds(offers: VersionedOffer[]): Set<string> {
	const latest = new Map<string, number>();
	for (const offer of offers) {
		const family = offerFamilyId(offer);
		latest.set(family, Math.max(latest.get(family) ?? 0, offer.revision));
	}
	return new Set(
		offers
			.filter((offer) => offer.revision < (latest.get(offerFamilyId(offer)) ?? 0))
			.map((offer) => offer.id)
	);
}
