// What a customer's info link page receives — see
// src/lib/server/services/production-share.ts, which builds it. Here rather than
// there so the page, which runs in the browser, can name the types.

export type ShareUnit = {
	id: string;
	name: string;
	caption: string | null;
	manufacturer: string | null;
	tag: string | null;
	productId: string;
	/** The product's photo, resolved to an address like every URL here. */
	imageUrl: string | null;
	accessories: { id: string; name: string; tag: string | null; imageUrl: string | null }[];
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
};
