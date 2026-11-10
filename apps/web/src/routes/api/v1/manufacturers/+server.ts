import type { RequestHandler } from './$types';
import * as v from 'valibot';
import { prisma } from '#lib/server/auth.js';
import { apiJson, handleApi, requireApiUser, type Schemas } from '#lib/server/api.js';
import { findOrCreateManufacturer } from '#lib/server/services/manufacturers.js';
import { toManufacturer } from '#lib/server/services/api-mappers.js';
import { parseApiBody } from '#lib/server/api-body.js';

const WITH_COUNT = { _count: { select: { products: true } } } as const;

export const GET: RequestHandler = ({ locals }) =>
	handleApi(async () => {
		requireApiUser(locals);
		const manufacturers = await prisma.manufacturer.findMany({
			include: WITH_COUNT,
			orderBy: { name: 'asc' }
		});
		const body: Schemas['Manufacturer'][] = manufacturers.map(toManufacturer);
		return Response.json(body);
	});

// ManufacturerCreateRequest in openapi.yaml.
const bodySchema = v.strictObject({ name: v.pipe(v.string(), v.trim(), v.minLength(1)) });

export const POST: RequestHandler = ({ locals, request }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		const { name } = await parseApiBody(request, bodySchema);
		const { manufacturer, created } = await findOrCreateManufacturer(user.id, name);
		const withCount = await prisma.manufacturer.findUniqueOrThrow({
			where: { id: manufacturer.id },
			include: WITH_COUNT
		});
		return apiJson('ManufacturerCreated', { manufacturer: toManufacturer(withCount), created });
	});
