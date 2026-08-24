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

export type TransactionData =
	| CreatedData
	| UpdatedData
	| LocationAssignedData
	| CheckedOutData
	| ReturnedData
	| RequestedData
	| AddedToProductionData
	| ApprovedData
	| DeclinedData;
