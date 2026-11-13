import type { Prisma } from '#lib/prisma/client.js';
import { prisma } from '#lib/server/auth.js';
import { appError } from '#lib/errors.js';

// One product per name and manufacturer, ignoring case and surrounding blanks —
// the rule the unique index `Product_manufacturer_name_key` enforces. Checked
// here first so the user reads which name is taken instead of a failed insert.
// Every path that creates a product or changes its name or maker goes through
// this; the CSV import and the cable batch look the product up instead and reuse
// it, which is the same rule seen from the other side.

type Db = Pick<Prisma.TransactionClient, 'product'>;

/** The product already holding this name for this maker, if any. */
export async function productNameHolder(
	name: string,
	manufacturerId: string | null,
	{ exceptId, db = prisma }: { exceptId?: string; db?: Db } = {}
) {
	return db.product.findFirst({
		where: {
			manufacturerId,
			name: { equals: name.trim(), mode: 'insensitive' },
			...(exceptId ? { id: { not: exceptId } } : {})
		},
		select: { id: true, name: true }
	});
}

export async function productNameTaken(
	name: string,
	manufacturerId: string | null,
	options: { exceptId?: string; db?: Db } = {}
) {
	return (await productNameHolder(name, manufacturerId, options)) !== null;
}

/** Refuses a taken name, naming the product as it is spelt in the catalogue. */
export async function assertProductNameFree(
	name: string,
	manufacturerId: string | null,
	options: { exceptId?: string; db?: Db } = {}
) {
	const holder = await productNameHolder(name, manufacturerId, options);
	if (holder) appError(409, 'product_exists', [holder.name]);
}
