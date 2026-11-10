import type { RequestHandler } from './$types';
import * as v from 'valibot';
import { prisma } from '#lib/server/auth.js';
import { apiJson, handleApi, requireApiUser } from '#lib/server/api.js';
import { updateManufacturer } from '#lib/server/services/manufacturers.js';
import { toManufacturer } from '#lib/server/services/api-mappers.js';
import { requireManufacturerExists } from '#lib/server/api-catalog.js';
import { parseApiBody } from '#lib/server/api-body.js';

// ManufacturerUpdateRequest in openapi.yaml.
const bodySchema = v.strictObject({ name: v.pipe(v.string(), v.trim(), v.minLength(1)) });

export const PATCH: RequestHandler = ({ locals, params, request }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		const { name } = await parseApiBody(request, bodySchema);
		await requireManufacturerExists(params.manufacturerId);
		await updateManufacturer(user.id, { manufacturerId: params.manufacturerId, name });
		const manufacturer = await prisma.manufacturer.findUniqueOrThrow({
			where: { id: params.manufacturerId },
			include: { _count: { select: { products: true } } }
		});
		return apiJson('Manufacturer', toManufacturer(manufacturer));
	});
