import type { RequestHandler } from './$types';
import * as v from 'valibot';
import { prisma } from '#lib/server/auth.js';
import { apiError, ApiResponse, apiJson, handleApi, requireApiUser } from '#lib/server/api.js';
import { deleteProduct, setProductPorts, updateProduct } from '#lib/server/services/products.js';
import {
	catalogProductBody,
	requireManufacturerExists,
	requireProductExists
} from '#lib/server/api-catalog.js';
import { connectorSlug } from '#lib/server/services/connectors.js';
import { PORT_REQUIREMENTS } from '#lib/ports.js';
import { parseApiBody } from '#lib/server/api-body.js';
import { DEFAULT_INSPECTION_TYPE_ID } from '#lib/inspection-due.js';

// ProductUpdateRequest in openapi.yaml. Strict, so a misspelt field is an
// error rather than a change that silently did not happen.
const bodySchema = v.strictObject({
	name: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1))),
	caption: v.optional(v.string()),
	details: v.optional(v.string()),
	manufacturerId: v.optional(v.nullable(v.pipe(v.string(), v.minLength(1)))),
	categoryId: v.optional(v.pipe(v.string(), v.minLength(1))),
	isLicense: v.optional(v.boolean()),
	notInterchangeable: v.optional(v.boolean()),
	isContainer: v.optional(v.boolean()),
	requiresInspection: v.optional(v.nullable(v.boolean())),
	inspections: v.optional(v.record(v.string(), v.nullable(v.boolean()))),
	cable: v.optional(
		v.nullable(
			v.strictObject({
				type: v.optional(v.nullable(v.string())),
				connectorA: v.optional(v.nullable(v.string())),
				connectorB: v.optional(v.nullable(v.string())),
				lengthCm: v.optional(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1)))),
				ways: v.optional(
					v.array(
						v.strictObject({
							count: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(99)),
							type: v.optional(v.nullable(v.string())),
							connectorA: v.optional(v.nullable(v.string())),
							connectorB: v.optional(v.nullable(v.string()))
						})
					)
				)
			})
		)
	),
	ports: v.optional(
		v.pipe(
			v.array(
				v.strictObject({
					connector: v.pipe(v.string(), v.trim(), v.minLength(1)),
					count: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(999)),
					label: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(80)))),
					requirement: v.optional(v.nullable(v.picklist(PORT_REQUIREMENTS)))
				})
			),
			v.maxLength(100)
		)
	)
});

/**
 * A panel's connector names as ids. Only connectors the catalog has: unlike a
 * cable end, a port is picked from the list on the web too, and a typo here
 * would otherwise become a connector nobody meant.
 */
async function portInputs(ports: v.InferOutput<typeof bodySchema>['ports']) {
	if (ports === undefined) return undefined;
	const slugs = [...new Set(ports.map((p) => connectorSlug(p.connector)))];
	const found = await prisma.connector.findMany({
		where: { slug: { in: slugs } },
		select: { id: true, slug: true }
	});
	const idOf = new Map(found.map((c) => [c.slug, c.id]));
	const missing = ports.filter((p) => !idOf.has(connectorSlug(p.connector)));
	if (missing.length > 0) {
		throw new ApiResponse(
			apiError(
				404,
				'connector_not_found',
				`No connector named ${missing.map((p) => `"${p.connector}"`).join(', ')} — see listConnectors.`
			)
		);
	}
	return ports.map((p) => ({
		connectorId: idOf.get(connectorSlug(p.connector))!,
		count: p.count,
		label: p.label ?? null,
		requirement: p.requirement ?? null
	}));
}

export const PATCH: RequestHandler = ({ locals, params, request }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		const body = await parseApiBody(request, bodySchema);

		await requireProductExists(params.productId);
		if (body.manufacturerId) await requireManufacturerExists(body.manufacturerId);
		if (body.categoryId) {
			const category = await prisma.category.findUnique({
				where: { id: body.categoryId },
				select: { id: true }
			});
			if (!category) {
				throw new ApiResponse(
					apiError(404, 'category_not_found', `Category "${body.categoryId}" not found`)
				);
			}
		}

		// Resolved before anything is written, so a misspelt connector changes nothing.
		const ports = await portInputs(body.ports);
		const { name, manufacturerId, caption, details, categoryId, isLicense } = body;
		const { notInterchangeable, isContainer } = body;
		const { requiresInspection, inspections, cable } = body;
		const { unitsChanged } = await updateProduct(user.id, {
			productId: params.productId,
			name,
			manufacturerId,
			caption,
			details,
			categoryId,
			isLicense,
			notInterchangeable,
			isContainer,
			inspections:
				requiresInspection === undefined && inspections === undefined
					? undefined
					: {
							...(requiresInspection !== undefined
								? { [DEFAULT_INSPECTION_TYPE_ID]: requiresInspection }
								: {}),
							...inspections
						},
			// The API calls the wire `type`, like CableSpec; the service `cableType`.
			...(cable === undefined
				? {}
				: {
						cable: cable && {
							cableType: cable.type,
							connectorA: cable.connectorA,
							connectorB: cable.connectorB,
							lengthCm: cable.lengthCm,
							ways: cable.ways?.map(({ type, ...way }) => ({ ...way, cableType: type }))
						}
					})
		});
		if (ports) await setProductPorts(user.id, params.productId, ports);

		return apiJson('ProductUpdated', {
			product: await catalogProductBody(user.id, params.productId),
			unitsChanged: unitsChanged.length
		});
	});

export const GET: RequestHandler = ({ locals, params }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		await requireProductExists(params.productId);
		return apiJson('CatalogProduct', await catalogProductBody(user.id, params.productId));
	});

export const DELETE: RequestHandler = ({ locals, params }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		await requireProductExists(params.productId);
		const { id } = await deleteProduct(user.id, params.productId);
		return apiJson('ProductDeleted', { id });
	});
