import { query, command } from '$app/server';
import { prisma } from '$lib/server/auth';
import * as v from 'valibot';
import { requireOrgInventory } from '$lib/server/services/access';
import { appError } from '$lib/errors';
import { SERVICE_UNITS } from '$lib/service-lines.svelte';

// The org's price list for what it bills besides equipment. Kept and read by
// the same rung that writes offers and invoices: it is their price list, and a
// line picked from it copies the values, so nothing here reaches a document
// that already exists.

function requireCatalog(orgId: string) {
	return requireOrgInventory(orgId, 'billing_manage_forbidden');
}

const toCents = (value: number) => Math.round(value * 100) / 100;

export const getServiceCatalog = query(v.string(), async (orgId: string) => {
	await requireCatalog(orgId);
	return prisma.serviceCategory.findMany({
		where: { organizationId: orgId },
		include: { services: { orderBy: { name: 'asc' } } },
		orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
	});
});

async function findCategory(id: string) {
	const category = await prisma.serviceCategory.findUnique({ where: { id } });
	if (!category) appError(404, 'service_category_not_found');
	await requireCatalog(category.organizationId);
	return category;
}

async function findService(id: string) {
	const service = await prisma.orgService.findUnique({ where: { id } });
	if (!service) appError(404, 'service_not_found');
	await requireCatalog(service.organizationId);
	return service;
}

const color = v.pipe(v.string(), v.regex(/^#[0-9a-fA-F]{6}$/));

const createCategorySchema = v.object({
	orgId: v.string(),
	name: v.pipe(v.string(), v.trim(), v.minLength(1)),
	color
});

export const createServiceCategory = command(createCategorySchema, async ({ orgId, ...data }) => {
	await requireCatalog(orgId);
	const last = await prisma.serviceCategory.aggregate({
		where: { organizationId: orgId },
		_max: { sortOrder: true }
	});
	await prisma.serviceCategory.create({
		data: { ...data, organizationId: orgId, sortOrder: (last._max.sortOrder ?? -1) + 1 }
	});
	await getServiceCatalog(orgId).refresh();
});

const updateCategorySchema = v.object({
	id: v.string(),
	name: v.pipe(v.string(), v.trim(), v.minLength(1)),
	color
});

export const updateServiceCategory = command(updateCategorySchema, async ({ id, ...data }) => {
	const category = await findCategory(id);
	await prisma.serviceCategory.update({ where: { id }, data });
	await getServiceCatalog(category.organizationId).refresh();
});

// Takes its services with it. Lines already on a document keep the section
// they snapshotted, so this changes no offer or invoice.
export const deleteServiceCategory = command(v.string(), async (id: string) => {
	const category = await findCategory(id);
	await prisma.serviceCategory.delete({ where: { id } });
	await getServiceCatalog(category.organizationId).refresh();
});

const moveCategorySchema = v.object({ id: v.string(), direction: v.picklist(['up', 'down']) });

/** Swaps with the neighbour and renumbers the rest — see moveServiceLine. */
export const moveServiceCategory = command(moveCategorySchema, async ({ id, direction }) => {
	const category = await findCategory(id);
	const ids = (
		await prisma.serviceCategory.findMany({
			where: { organizationId: category.organizationId },
			orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
			select: { id: true }
		})
	).map((row) => row.id);
	const from = ids.indexOf(id);
	const to = direction === 'up' ? from - 1 : from + 1;
	if (to < 0 || to >= ids.length) return;
	[ids[from], ids[to]] = [ids[to], ids[from]];
	await prisma.$transaction(
		ids.map((rowId, sortOrder) =>
			prisma.serviceCategory.update({ where: { id: rowId }, data: { sortOrder } })
		)
	);
	await getServiceCatalog(category.organizationId).refresh();
});

const serviceFields = {
	categoryId: v.string(),
	name: v.pipe(v.string(), v.trim(), v.minLength(1)),
	unit: v.picklist(SERVICE_UNITS),
	unitPrice: v.pipe(v.number(), v.minValue(0)),
	perDay: v.boolean()
};

export const createOrgService = command(v.object(serviceFields), async (data) => {
	const category = await findCategory(data.categoryId);
	await prisma.orgService.create({
		data: {
			...data,
			unitPrice: toCents(data.unitPrice),
			organizationId: category.organizationId
		}
	});
	await getServiceCatalog(category.organizationId).refresh();
});

export const updateOrgService = command(
	v.object({ id: v.string(), ...serviceFields }),
	async ({ id, ...data }) => {
		const service = await findService(id);
		const category = await findCategory(data.categoryId);
		// A service can only move within its own org's categories.
		if (category.organizationId !== service.organizationId) {
			appError(404, 'service_category_not_found');
		}
		await prisma.orgService.update({
			where: { id },
			data: { ...data, unitPrice: toCents(data.unitPrice) }
		});
		await getServiceCatalog(service.organizationId).refresh();
	}
);

export const deleteOrgService = command(v.string(), async (id: string) => {
	const service = await findService(id);
	await prisma.orgService.delete({ where: { id } });
	await getServiceCatalog(service.organizationId).refresh();
});
