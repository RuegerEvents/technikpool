export type BillingItem = {
	id: string;
	categoryId: string | null;
	categoryName: string | null;
	categoryNameDe?: string | null;
	categoryColor: string | null;
	productId?: string | null;
	productLabel?: string | null;
	bundleId?: string | null;
	description: string;
	netPurchasePrice: unknown;
	ratePercent: unknown;
	dailyRate: unknown;
	lineTotal: unknown;
	kind?: string;
	quantity?: unknown;
	unit?: string | null;
	unitPrice?: unknown;
	perDay?: boolean;
	note?: string | null;
	position?: number;
	categorySortOrder?: number | null;
	serviceId?: string | null;
};

/** The document service lines are added to, and the org whose price list they come from. */
export type ServiceLineTarget = {
	kind: 'offer' | 'invoice';
	documentId: string;
	organizationId: string;
};

export type EditedServiceLine = {
	id: string;
	serviceId: string | null;
	name: string;
	note: string | null;
	categoryId: string | null;
	quantity: number;
	unit: string | null;
	unitPrice: number;
	perDay: boolean;
};

export type DurationInfo = {
	days: number | null;
	start: Date | string | null;
	end: Date | string | null;
};
