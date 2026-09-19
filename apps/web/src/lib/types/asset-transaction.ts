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

export type TransactionData =
	| CreatedData
	| UpdatedData
	| LocationAssignedData
	| CheckedOutData
	| ReturnedData
	| RequestedData
	| AddedToProductionData
	| ApprovedData
	| DeclinedData
	| BookingCancelledData
	| AccessoryAttachedData
	| AccessoryDetachedData
	| CredentialsSetData
	| CredentialsRemovedData
	| CredentialsRevealedData;
