import type { RequestHandler } from './$types';
import * as v from 'valibot';
import { prisma } from '#lib/server/auth.js';
import { apiJson, handleApi, requireApiUser } from '#lib/server/api.js';
import { mergeManufacturers } from '#lib/server/services/manufacturers.js';
import { toManufacturer } from '#lib/server/services/api-mappers.js';
import { requireManufacturerExists } from '#lib/server/api-catalog.js';
import { parseApiBody } from '#lib/server/api-body.js';

// ManufacturerMergeRequest in openapi.yaml.
const bodySchema = v.strictObject({ sourceManufacturerId: v.pipe(v.string(), v.minLength(1)) });

export const POST: RequestHandler = ({ locals, params, request }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		const { sourceManufacturerId } = await parseApiBody(request, bodySchema);
		await requireManufacturerExists(params.manufacturerId);
		await requireManufacturerExists(sourceManufacturerId);
		const { movedProducts } = await mergeManufacturers(user.id, {
			targetManufacturerId: params.manufacturerId,
			sourceManufacturerId
		});
		const manufacturer = await prisma.manufacturer.findUniqueOrThrow({
			where: { id: params.manufacturerId },
			include: { _count: { select: { products: true } } }
		});
		return apiJson('ManufacturerMerged', {
			manufacturer: toManufacturer(manufacturer),
			movedProducts
		});
	});
