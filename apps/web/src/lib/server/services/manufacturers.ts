import { prisma } from '#lib/server/auth.js';
import { appError } from '#lib/errors.js';
import { isSystemAdmin, writableOrgIds } from '#lib/server/services/access.js';
import { fieldChanges, logCatalogChange } from '#lib/server/services/catalog-log.js';

// Manufacturers are global rows shared by every org, and editing or merging
// one rewrites labels on other orgs' inventory and future documents — so,
// like categories, they are system-admin territory. Creating one stays open
// to anyone who works in an org (the asset wizard has to register gear nobody
// has catalogued yet). Shared by the web's remote functions and `/api/v1`.

async function requireSystemAdminId(userId: string) {
	if (!(await isSystemAdmin(userId))) appError(403, 'admin_required');
}

/** The manufacturer of this name, ignoring case and blanks, else a new one. */
export async function findOrCreateManufacturer(userId: string, rawName: string) {
	const name = rawName.trim();
	if (!name) appError(400, 'manufacturer_name_required');
	const existing = await prisma.manufacturer.findFirst({
		where: { name: { equals: name, mode: 'insensitive' } }
	});
	if (existing) return { manufacturer: existing, created: false };
	if (!(await isSystemAdmin(userId)) && (await writableOrgIds(userId)).length === 0) {
		appError(403, 'product_edit_forbidden');
	}
	return { manufacturer: await prisma.manufacturer.create({ data: { name } }), created: true };
}

export async function updateManufacturer(
	userId: string,
	input: { manufacturerId: string; name: string }
) {
	await requireSystemAdminId(userId);
	const name = input.name.trim();
	if (!name) appError(400, 'manufacturer_name_required');
	const clash = await prisma.manufacturer.findFirst({
		where: { name: { equals: name, mode: 'insensitive' }, id: { not: input.manufacturerId } },
		select: { id: true }
	});
	if (clash) appError(409, 'manufacturer_exists');
	const previous = await prisma.manufacturer.findUniqueOrThrow({
		where: { id: input.manufacturerId },
		select: { name: true }
	});
	const manufacturer = await prisma.manufacturer.update({
		where: { id: input.manufacturerId },
		data: { name }
	});
	const changes = fieldChanges(previous, { name });
	if (changes.length > 0) {
		await logCatalogChange({
			userId,
			action: 'MANUFACTURER_UPDATED',
			manufacturerId: manufacturer.id,
			data: { changes }
		});
	}
	return manufacturer;
}

export async function mergeManufacturers(
	userId: string,
	{
		targetManufacturerId,
		sourceManufacturerId
	}: { targetManufacturerId: string; sourceManufacturerId: string }
) {
	await requireSystemAdminId(userId);
	if (targetManufacturerId === sourceManufacturerId) {
		appError(409, 'manufacturer_merge_self');
	}
	const [target, source] = await Promise.all([
		prisma.manufacturer.findUniqueOrThrow({ where: { id: targetManufacturerId } }),
		prisma.manufacturer.findUniqueOrThrow({ where: { id: sourceManufacturerId } })
	]);
	const movedProducts = await prisma.product.count({ where: { manufacturerId: source.id } });
	// Two spellings of one maker usually both got the same model entered, and
	// one manufacturer cannot hold two products of one name. Those have to be
	// merged first, and the product merge is where the units are sorted out.
	const [sourceNames, targetNames] = await Promise.all(
		[source.id, target.id].map((manufacturerId) =>
			prisma.product.findMany({ where: { manufacturerId }, select: { name: true } })
		)
	);
	const taken = new Set(targetNames.map((p) => p.name.trim().toLowerCase()));
	const clashes = sourceNames.filter((p) => taken.has(p.name.trim().toLowerCase()));
	if (clashes.length > 0) {
		appError(409, 'manufacturer_merge_product_clash', [clashes.map((p) => p.name).join(', ')]);
	}
	await prisma.$transaction(async (tx) => {
		await tx.product.updateMany({
			where: { manufacturerId: source.id },
			data: { manufacturerId: target.id }
		});
		if (!target.logoPath && source.logoPath) {
			await tx.manufacturer.update({
				where: { id: target.id },
				data: { logoPath: source.logoPath }
			});
		}
		await tx.manufacturer.delete({ where: { id: source.id } });
	});
	await logCatalogChange({
		userId,
		action: 'MANUFACTURER_MERGED',
		manufacturerId: target.id,
		data: {
			source: { id: source.id, name: source.name },
			target: { id: target.id, name: target.name },
			movedProducts
		}
	});
	return { target, source, movedProducts };
}
