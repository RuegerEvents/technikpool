import type { RequestHandler } from './$types';
import { prisma } from '#lib/server/auth.js';
import { handleApi, requireApiUser, type Schemas } from '#lib/server/api.js';
import { naturalCompare } from '#lib/sort.js';

// Global like categories: a connector is a kind of plug, not anyone's record.
export const GET: RequestHandler = ({ locals }) =>
	handleApi(async () => {
		requireApiUser(locals);
		const connectors = await prisma.connector.findMany({
			select: { name: true, family: true, mains: true }
		});
		const body: Schemas['Connector'][] = connectors
			.sort((a, b) => naturalCompare(a.name, b.name))
			.map((c) => ({ name: c.name, family: c.family, mains: c.mains }));
		return Response.json(body);
	});
