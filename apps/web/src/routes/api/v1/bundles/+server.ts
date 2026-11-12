import type { RequestHandler } from './$types';
import { handleApi, requireApiUser, type Schemas } from '#lib/server/api.js';
import { jsonBody, requireString } from '#lib/server/stocktake-api.js';
import { bundleResponse } from '#lib/server/bundle-api.js';
import { createBundle, listBundles } from '#lib/server/services/bundles.js';
import { toBundleSummary } from '#lib/server/services/api-mappers.js';

export const GET: RequestHandler = ({ locals, url }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		const bundles = await listBundles(
			user.id,
			url.searchParams.get('organizationId') ?? undefined,
			url.searchParams.get('q') ?? undefined
		);
		return Response.json(
			bundles.map((b) => toBundleSummary(b, b.unitCount)) satisfies Schemas['BundleSummary'][]
		);
	});

export const POST: RequestHandler = ({ locals, request }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		const body = await jsonBody(request);
		const { bundle } = await createBundle(user.id, {
			organizationId: requireString(body, 'organizationId'),
			newTemplateName: requireString(body, 'name').trim(),
			categoryId: requireString(body, 'categoryId'),
			caption: typeof body.caption === 'string' ? body.caption : undefined,
			tag: typeof body.tag === 'string' ? body.tag : undefined
		});
		return Response.json(
			(await bundleResponse(user.id, bundle.id)) satisfies Schemas['BundleDetail'],
			{ status: 201 }
		);
	});
