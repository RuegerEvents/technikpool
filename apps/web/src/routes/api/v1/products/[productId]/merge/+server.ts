import type { RequestHandler } from './$types';
import * as v from 'valibot';
import { apiJson, handleApi, requireApiUser } from '#lib/server/api.js';
import { mergeProducts } from '#lib/server/services/products.js';
import { catalogProductBody, requireProductExists } from '#lib/server/api-catalog.js';
import { parseApiBody } from '#lib/server/api-body.js';

// ProductMergeRequest in openapi.yaml.
const bodySchema = v.strictObject({ sourceProductId: v.pipe(v.string(), v.minLength(1)) });

export const POST: RequestHandler = ({ locals, params, request }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		const { sourceProductId } = await parseApiBody(request, bodySchema);
		await requireProductExists(params.productId);
		await requireProductExists(sourceProductId);

		const { moving, inheritedImage, inheritedCable, inheritedLicense } = await mergeProducts(
			user.id,
			{ targetProductId: params.productId, sourceProductId }
		);
		return apiJson('ProductMerged', {
			product: await catalogProductBody(user.id, params.productId),
			movedUnits: moving.length,
			inheritedImage,
			inheritedCable,
			inheritedLicense
		});
	});
