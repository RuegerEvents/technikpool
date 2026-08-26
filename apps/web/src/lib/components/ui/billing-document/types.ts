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
};

export type DurationInfo = {
	days: number | null;
	start: Date | string | null;
	end: Date | string | null;
};
