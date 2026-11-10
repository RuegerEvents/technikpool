import type { RequestHandler } from './$types';
import * as v from 'valibot';
import { prisma } from '#lib/server/auth.js';
import { apiError, ApiResponse, apiJson, handleApi, requireApiUser } from '#lib/server/api.js';
import { updateCategory } from '#lib/server/services/products.js';
import { toCategory } from '#lib/server/services/api-mappers.js';
import { parseApiBody } from '#lib/server/api-body.js';

// CategoryUpdateRequest in openapi.yaml.
const bodySchema = v.strictObject({
	name: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1))),
	color: v.optional(v.pipe(v.string(), v.regex(/^#[0-9a-fA-F]{6}$/))),
	sortOrder: v.optional(v.pipe(v.number(), v.integer())),
	requiresInspection: v.optional(v.boolean())
});

export const PATCH: RequestHandler = ({ locals, params, request }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		const body = await parseApiBody(request, bodySchema);

		const exists = await prisma.category.findUnique({
			where: { id: params.categoryId },
			select: { id: true }
		});
		if (!exists) {
			throw new ApiResponse(
				apiError(404, 'category_not_found', `Category "${params.categoryId}" not found`)
			);
		}

		const { category, unitsChanged } = await updateCategory(user.id, {
			categoryId: params.categoryId,
			...body
		});
		return apiJson('CategoryUpdated', {
			category: toCategory(category),
			unitsChanged: unitsChanged.length
		});
	});
