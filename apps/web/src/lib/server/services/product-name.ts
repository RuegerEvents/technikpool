import type { Prisma } from '$lib/prisma/client';
import { prisma } from '$lib/server/auth';
import { appError } from '$lib/errors';

// One product per name and manufacturer, ignoring case and surrounding blanks —
// the rule the unique index `Product_manufacturer_name_key` enforces. Checked
// here first so the user reads which name is taken instead of a failed insert.
// Every path that creates a product or changes its name or maker goes through
// this; the CSV import and the cable batch look the product up instead and reuse
// it, which is the same rule seen from the other side.

type Db = Pick<Prisma.TransactionClient, 'product'>;

export async function productNameTaken(
	name: string,
	manufacturerId: string | null,
	{ exceptId, db = prisma }: { exceptId?: string; db?: Db } = {}
) {
	const clash = await db.product.findFirst({
		where: {
			manufacturerId,
			name: { equals: name.trim(), mode: 'insensitive' },
			...(exceptId ? { id: { not: exceptId } } : {})
		},
		select: { id: true }
	});
	return clash !== null;
}

export async function assertProductNameFree(
	name: string,
	manufacturerId: string | null,
	options: { exceptId?: string; db?: Db } = {}
) {
	if (await productNameTaken(name, manufacturerId, options)) {
		appError(409, 'product_exists', [name.trim()]);
	}
}
