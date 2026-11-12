import type { RequestHandler } from './$types';
import { handleApi, requireApiUser, type Schemas } from '#lib/server/api.js';
import { listInspectionTypes } from '#lib/server/services/inspections.js';

// Shared by every org, like categories; signed in, because the list is not public.
export const GET: RequestHandler = ({ locals }) =>
	handleApi(async () => {
		requireApiUser(locals);
		const types = await listInspectionTypes();
		return Response.json(
			types.map((t): Schemas['InspectionType'] => ({
				id: t.id,
				key: t.key,
				name: t.name,
				nameDe: t.nameDe,
				sortOrder: t.sortOrder,
				failStatus: t.failStatus,
				requiresQualification: t.requiresQualification,
				hasMeasurements: t.hasMeasurements,
				defaultIntervalMonths: t.defaultIntervalMonths
			}))
		);
	});
