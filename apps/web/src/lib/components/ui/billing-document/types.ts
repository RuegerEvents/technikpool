export type BillingItem = {
	id: string;
	categoryId: string | null;
	categoryName: string | null;
	categoryColor: string | null;
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
