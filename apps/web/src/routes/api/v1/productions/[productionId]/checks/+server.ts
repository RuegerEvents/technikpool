import type { RequestHandler } from './$types';
import { apiJson, handleApi, requireApiUser } from '$lib/server/api';
import { withCheckErrors } from '$lib/server/production-check-api';
import { getProductionCheck, openProductionCheck } from '$lib/server/services/production-check';
import { toProductionCheck } from '$lib/server/services/api-mappers';

export const POST: RequestHandler = ({ locals, params, request }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		// The body is optional: most callers stand on one side only.
		const body = (await request.json().catch(() => null)) as { organizationId?: unknown } | null;
		const organizationId =
			typeof body?.organizationId === 'string' ? body.organizationId : undefined;
		return withCheckErrors(async () => {
			const { id } = await openProductionCheck(user.id, params.productionId, organizationId);
			return apiJson('ProductionCheck', toProductionCheck(await getProductionCheck(user.id, id)));
		});
	});
