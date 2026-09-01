import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { prisma } from '$lib/server/auth';
import { getObject } from '$lib/server/storage';
import { isSystemAdmin } from '$lib/server/services/access';

// Everything one organization owns, as a single self-contained JSON document:
// every table row the org can see plus every stored file (archived PDFs,
// product photos, logos, generated previews) inlined as base64 under `files`,
// keyed by the same object path the rows reference. One request, no follow-up
// fetches, nothing that needs this server to still exist to be readable.
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const organizationId = params.id;

	// The export contains member emails, customer data and finished invoices —
	// the same bar as managing the org, not merely belonging to it.
	const membership = await prisma.orgMembership.findUnique({
		where: { userId_organizationId: { userId: locals.user.id, organizationId } }
	});
	const canExport =
		(membership && (membership.role === 'OWNER' || membership.role === 'ADMIN')) ||
		(await isSystemAdmin(locals.user.id));
	if (!canExport) error(403, 'Only organization owners and admins can export');

	const organization = await prisma.organization.findUnique({
		where: { id: organizationId },
		include: { address: true }
	});
	if (!organization) error(404, 'Organization not found');

	const userFields = { select: { id: true, email: true, name: true } } as const;

	const [
		members,
		locations,
		customers,
		assets,
		bundleTemplates,
		bundles,
		productions,
		offers,
		invoices,
		offerSequences,
		categoryRates,
		productPrices,
		products,
		assetTransactions
	] = await Promise.all([
		prisma.orgMembership.findMany({
			where: { organizationId },
			include: { user: userFields }
		}),
		prisma.location.findMany({ where: { organizationId }, include: { address: true } }),
		prisma.customer.findMany({ where: { organizationId }, include: { address: true } }),
		prisma.asset.findMany({
			where: { organizationId },
			include: { inspections: { orderBy: { performedAt: 'asc' } } }
		}),
		prisma.bundleTemplate.findMany({ where: { organizationId } }),
		prisma.assetBundle.findMany({ where: { template: { organizationId } } }),
		prisma.production.findMany({
			where: { organizationId },
			include: {
				address: true,
				items: true,
				crew: { include: { user: userFields } }
			}
		}),
		prisma.offer.findMany({
			where: { organizationId },
			include: { items: { orderBy: { createdAt: 'asc' } } }
		}),
		prisma.invoice.findMany({
			where: { organizationId },
			include: { items: { orderBy: { createdAt: 'asc' } } }
		}),
		prisma.offerSequence.findMany({ where: { organizationId } }),
		prisma.orgCategoryRate.findMany({ where: { organizationId }, include: { category: true } }),
		prisma.orgProductPrice.findMany({ where: { organizationId } }),
		// The catalog is global; export the slice this org actually references —
		// its units' products and everything it has priced.
		prisma.product.findMany({
			where: {
				OR: [{ assets: { some: { organizationId } } }, { orgPrices: { some: { organizationId } } }]
			},
			include: { manufacturer: true, category: true }
		}),
		prisma.assetTransaction.findMany({
			where: { asset: { organizationId } },
			include: { user: userFields },
			orderBy: { createdAt: 'asc' }
		})
	]);

	const fileKeys = new Set<string>();
	for (const product of products) {
		if (product.imagePath) fileKeys.add(product.imagePath);
		if (product.manufacturer.logoPath) fileKeys.add(product.manufacturer.logoPath);
	}
	for (const asset of assets) if (asset.generatedImagePath) fileKeys.add(asset.generatedImagePath);
	for (const bundle of bundles) if (bundle.imagePath) fileKeys.add(bundle.imagePath);
	for (const document of [...offers, ...invoices])
		if (document.pdfPath) fileKeys.add(document.pdfPath);

	const files: Record<string, { contentType: string; base64: string }> = {};
	for (const key of fileKeys) {
		try {
			const { bytes, contentType } = await getObject(key);
			files[key] = { contentType, base64: Buffer.from(bytes).toString('base64') };
		} catch {
			// A dangling object reference must not sink the rest of the export;
			// the row keeps its path so the gap stays visible.
		}
	}

	const body = JSON.stringify({
		exportVersion: 1,
		exportedAt: new Date().toISOString(),
		organization,
		members,
		locations,
		customers,
		products,
		productPrices,
		categoryRates,
		assets,
		bundleTemplates,
		bundles,
		productions,
		offers,
		invoices,
		offerSequences,
		assetTransactions,
		files
	});

	const date = new Date().toISOString().slice(0, 10);
	return new Response(body, {
		headers: {
			'content-type': 'application/json',
			'content-disposition': `attachment; filename="technikpool-export-${organization.assetIdPrefix}-${date}.json"`,
			'cache-control': 'private, no-store'
		}
	});
};
