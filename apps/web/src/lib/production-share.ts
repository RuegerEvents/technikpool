// What a customer's info link page receives — see
// src/lib/server/services/production-share.ts, which builds it. Here rather than
// there so the page, which runs in the browser, can name the types.

import type { CableColorBand } from '#lib/cable-colors.js';

/** Proof of one inspection type: until when it is good (its next due date). */
export type ShareInspection = {
	name: string;
	nameDe: string | null;
	/** YYYY-MM-DD. */
	validUntil: string;
	overdue: boolean;
};

export type ShareUnit = {
	id: string;
	name: string;
	caption: string | null;
	manufacturer: string | null;
	tag: string | null;
	productId: string;
	/** The product's photo, resolved to an address like every URL here. */
	imageUrl: string | null;
	inspections: ShareInspection[];
	/** Its cable colour in its owner's scheme; absent or null when it has none. */
	cableColor?: CableColorBand | null;
	accessories: {
		id: string;
		name: string;
		tag: string | null;
		imageUrl: string | null;
		inspections: ShareInspection[];
	}[];
};

export type ShareView = {
	production: {
		name: string;
		start: string | null;
		end: string | null;
		venue: string | null;
	};
	organization: { name: string; logoUrl: string | null };
	bundles: {
		id: string;
		name: string;
		caption: string | null;
		tag: string | null;
		/** The case's generated preview of what is in it. */
		imageUrl: string | null;
		units: ShareUnit[];
	}[];
	units: ShareUnit[];
	documents: Record<
		string,
		{ id: string; kind: 'MANUAL' | 'DATASHEET' | 'OTHER'; title: string; url: string }[]
	>;
	expiresAt: string | null;
	/** The colour code of every owner whose cables on the list carry a colour. */
	cableColors?: { organization: string; bands: CableColorBand[] }[];
	/** The production org's rental terms the job is booked under, if it has any. */
	rentalTerms: { orgSlug: string; number: number; date: string } | null;
};
