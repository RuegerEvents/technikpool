export type FieldChange = {
	field: string;
	from: string | null;
	to: string | null;
	fromRef?: { type: 'location' | 'production'; id: string } | null;
	toRef?: { type: 'location' | 'production'; id: string } | null;
};

export type CreatedData = { type: 'CREATED' };

export type UpdatedData = {
	type: 'UPDATED';
	changes: FieldChange[];
};

export type LocationAssignedData = {
	type: 'LOCATION_ASSIGNED';
	locationId: string;
	locationName: string;
};

export type CheckedOutData = {
	type: 'CHECKED_OUT';
	productionId: string;
	productionName: string;
};

/**
 * A unit ticked as handed out was unticked again before it left: back to
 * booked, as if the checkout had not happened.
 */
export type CheckoutUndoneData = {
	type: 'CHECKOUT_UNDONE';
	productionId: string;
	productionName: string;
};

export type ReturnedData = {
	type: 'RETURNED';
	fromProductionId: string;
	fromProductionName: string;
	toLocationId: string;
	toLocationName: string;
};

export type RequestedData = {
	type: 'REQUESTED';
	productionId: string;
	productionName: string;
	requestingOrgId: string;
	requestingOrgName: string;
};

export type AddedToProductionData = {
	type: 'ADDED_TO_PRODUCTION';
	productionId: string;
	productionName: string;
};

export type ApprovedData = {
	type: 'APPROVED';
	productionId: string;
	productionName: string;
};

export type DeclinedData = {
	type: 'DECLINED';
	productionId: string;
	productionName: string;
};

/** The production this unit was requested for or booked to was cancelled, which freed it. */
export type BookingCancelledData = {
	type: 'BOOKING_CANCELLED';
	productionId: string;
	productionName: string;
};

/**
 * Another unit of the same product went out in this one's place, so the
 * booking moved to it and this one is free again — see `findStandIns`.
 */
export type BookingReplacedData = {
	type: 'BOOKING_REPLACED';
	productionId: string;
	productionName: string;
	replacedByAssetId: string;
	replacedByLabel: string;
};

export type AccessoryAttachedData = {
	type: 'ACCESSORY_ATTACHED';
	parentAssetId: string;
	parentLabel: string;
};

export type AccessoryDetachedData = {
	type: 'ACCESSORY_DETACHED';
	parentAssetId: string;
	parentLabel: string;
};

/** A licence's credentials were stored or replaced. The values never go in here. */
export type CredentialsSetData = {
	type: 'CREDENTIALS_SET';
	kind: 'key' | 'login';
};

export type CredentialsRemovedData = { type: 'CREDENTIALS_REMOVED' };

/**
 * Someone looked at a licence's credentials, and on what grounds — the entry
 * that makes "who has seen the key" answerable after the fact.
 */
export type CredentialsRevealedData = {
	type: 'CREDENTIALS_REVEALED';
	via: 'location' | 'production' | 'admin';
	productionId?: string;
	productionName?: string;
};

/** Counted in a stocktake: written once per unit when the stocktake closes. */
export type StocktakeCountedData = {
	type: 'STOCKTAKE_COUNTED';
	stocktakeId: string;
	stocktakeName: string;
	result: 'found' | 'missing' | 'out';
	locationId: string | null;
	locationName: string | null;
};

/** Checked as part of a case — a kit, or a unit with its accessories. One entry per unit. */
export type CaseCheckedData = {
	type: 'CASE_CHECKED';
	caseKind: 'bundle' | 'asset';
	caseId: string;
	caseName: string;
	result: 'found' | 'missing' | 'away';
	/** Of the whole case, so one entry tells how the check went. */
	found: number;
	expected: number;
};

/** Checked against a production's list (Prüfen), written once per unit when the check closes. */
export type ProductionCheckedData = {
	type: 'PRODUCTION_CHECKED';
	productionId: string;
	productionName: string;
	checkId: string;
	result: 'found' | 'missing';
	/** Of the whole list, so one entry tells how the check went. */
	found: number;
	expected: number;
};

/** The borrowing production confirmed it has this lent unit. */
export type HandoverReceivedData = {
	type: 'HANDOVER_RECEIVED';
	productionId: string;
	productionName: string;
};

/** The borrowing production reported this lent unit as sent back. */
export type ReturnReportedData = {
	type: 'RETURN_REPORTED';
	productionId: string;
	productionName: string;
};

export type TransactionData =
	| CreatedData
	| UpdatedData
	| LocationAssignedData
	| CheckedOutData
	| CheckoutUndoneData
	| ReturnedData
	| RequestedData
	| AddedToProductionData
	| ApprovedData
	| DeclinedData
	| BookingCancelledData
	| BookingReplacedData
	| AccessoryAttachedData
	| AccessoryDetachedData
	| CredentialsSetData
	| CredentialsRemovedData
	| CredentialsRevealedData
	| StocktakeCountedData
	| CaseCheckedData
	| ProductionCheckedData
	| HandoverReceivedData
	| ReturnReportedData;
