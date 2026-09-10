export type ProductionHoverInfo = {
	name: string;
	color: string;
	startDate: Date | string;
	endDate: Date | string;
	showStartDate: Date | string | null;
	showEndDate: Date | string | null;
	// Null when the production belongs to an org the viewer isn't in — the
	// assets calendar shows those bookings but only carries their own columns.
	organization: string | null;
	customer: string | null;
	venue: { street: string; city: string } | null;
	itemCount: number | null;
	crewCount: number | null;
	// Per bar rather than per production: one asset's booking can be pending
	// while the production itself is not.
	pending?: boolean;
	booked?: { count: number; total: number };
};
