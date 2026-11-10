import type { RequestHandler } from './$types';
import * as v from 'valibot';
import { prisma } from '#lib/server/auth.js';
import { apiJson, handleApi, requireApiUser, type Schemas } from '#lib/server/api.js';
import { isSystemAdmin, managedOrgIds } from '#lib/server/services/access.js';
import { connectorProductCounts, ensureConnectors } from '#lib/server/services/connectors.js';
import { toConnector } from '#lib/server/services/api-mappers.js';
import { requireConnectorNamed } from '#lib/server/api-catalog.js';
import { parseApiBody } from '#lib/server/api-body.js';
import { naturalCompare } from '#lib/sort.js';
import { appError } from '#lib/errors.js';

// Global like categories: a connector is a kind of plug, not anyone's record.
export const GET: RequestHandler = ({ locals }) =>
	handleApi(async () => {
		requireApiUser(locals);
		const [connectors, counts] = await Promise.all([
			prisma.connector.findMany({ select: { id: true, name: true, family: true, mains: true } }),
			connectorProductCounts()
		]);
		const body: Schemas['Connector'][] = connectors
			.sort((a, b) => naturalCompare(a.name, b.name))
			.map((c) => toConnector(c, counts.get(c.id) ?? 0));
		return Response.json(body);
	});

// ConnectorCreateRequest in openapi.yaml.
const bodySchema = v.strictObject({
	name: v.pipe(v.string(), v.trim(), v.minLength(1)),
	family: v.optional(v.nullable(v.string()))
});

/**
 * Naming a connector is an org-admin right, as on the web's connector form. A
 * name the catalog has is returned as it is: changing a shared row is a
 * system admin's job (`PATCH /connectors/{connector}`).
 */
export const POST: RequestHandler = ({ locals, request }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		const { name, family } = await parseApiBody(request, bodySchema);
		if (!(await isSystemAdmin(user.id)) && (await managedOrgIds(user.id)).length === 0) {
			appError(403, 'connector_edit_forbidden');
		}
		const refs = await ensureConnectors([name]);
		const connector = await requireConnectorNamed(name);
		// A family given for a row created just now replaces the guessed one.
		const fixed =
			family?.trim() && refs.created.length > 0 && connector.family !== family.trim()
				? await prisma.connector.update({
						where: { id: connector.id },
						data: { family: family.trim() }
					})
				: connector;
		const counts = await connectorProductCounts();
		return apiJson('Connector', toConnector(fixed, counts.get(fixed.id) ?? 0));
	});
