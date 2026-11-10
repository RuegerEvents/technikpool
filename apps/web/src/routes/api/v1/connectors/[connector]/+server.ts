import type { RequestHandler } from './$types';
import * as v from 'valibot';
import { apiJson, handleApi, requireApiUser } from '#lib/server/api.js';
import { connectorProductCounts, setConnectorMains } from '#lib/server/services/connectors.js';
import { toConnector } from '#lib/server/services/api-mappers.js';
import { requireConnectorNamed } from '#lib/server/api-catalog.js';
import { parseApiBody } from '#lib/server/api-body.js';

// ConnectorUpdateRequest in openapi.yaml.
const bodySchema = v.strictObject({ mains: v.boolean() });

export const PATCH: RequestHandler = ({ locals, params, request }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		const { mains } = await parseApiBody(request, bodySchema);
		const connector = await requireConnectorNamed(params.connector);
		const updated = await setConnectorMains(user.id, connector.id, mains);
		const counts = await connectorProductCounts();
		return apiJson('Connector', toConnector(updated, counts.get(updated.id) ?? 0));
	});
