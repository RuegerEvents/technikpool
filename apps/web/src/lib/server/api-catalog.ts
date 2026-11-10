import { prisma } from '#lib/server/auth.js';
import { apiError, ApiResponse, type Schemas } from '#lib/server/api.js';
import { isSystemAdmin, userOrgIds } from '#lib/server/services/access.js';
import { mainsConnectorNames } from '#lib/server/services/inspections.js';
import { CATALOG_PRODUCT_INCLUDE, catalogUnitCounts } from '#lib/server/services/products.js';
import { connectorSlug } from '#lib/server/services/connectors.js';
import { toCatalogProduct } from '#lib/server/services/api-mappers.js';

// What the `/api/v1` catalog endpoints share: the 404s they answer before
// handing over to a service, and the product as `CatalogProduct` after it.

function notFound(code: string, message: string): never {
	throw new ApiResponse(apiError(404, code, message));
}

export async function requireProductExists(productId: string) {
	const found = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
	if (!found) notFound('product_not_found', `Product "${productId}" not found`);
}

export async function requireManufacturerExists(manufacturerId: string) {
	const found = await prisma.manufacturer.findUnique({
		where: { id: manufacturerId },
		select: { id: true }
	});
	if (!found) notFound('manufacturer_not_found', `Manufacturer "${manufacturerId}" not found`);
}

/** A connector by its name, matched the way the catalog files it (case and blanks ignored). */
export async function requireConnectorNamed(name: string) {
	const connector = await prisma.connector.findUnique({ where: { slug: connectorSlug(name) } });
	if (!connector) notFound('connector_not_found', `No connector named "${name}"`);
	return connector;
}

/** The product as `CatalogProduct`, with unit counts of the caller's orgs (every org for a system admin). */
export async function catalogProductBody(
	userId: string,
	productId: string
): Promise<Schemas['CatalogProduct']> {
	const orgIds = (await isSystemAdmin(userId)) ? null : await userOrgIds(userId);
	const [product, mainsConnectors, units] = await Promise.all([
		prisma.product.findUniqueOrThrow({
			where: { id: productId },
			include: CATALOG_PRODUCT_INCLUDE
		}),
		mainsConnectorNames(productId),
		catalogUnitCounts([productId], orgIds)
	]);
	return toCatalogProduct(product, { mainsConnectors, units: units(product.id) });
}
