import { query, command } from '$app/server';
import { error } from '@sveltejs/kit';
import * as v from 'valibot';
import { prisma } from '$lib/server/auth';
import {
	isSystemAdmin,
	managedOrgIds,
	requireAuth,
	requireSystemAdmin
} from '$lib/server/services/access';
import { connectorSlug } from '$lib/server/services/connectors';

/**
 * The connector catalogue: what a cable's ends are called, and what they look
 * like. Shared across organizations exactly like Manufacturer and Product are —
 * a Schuko plug is a Schuko plug in everyone's warehouse.
 */
export const getConnectors = query(async () => {
	await requireAuth();
	return await prisma.connector.findMany({
		include: { category: true },
		orderBy: { name: 'asc' }
	});
});

/**
 * *Naming* a connector is an org-admin right, the same rule `updateProduct`
 * applies. Deliberately not system-admin: the picker offers "create" on a name
 * the catalogue has never seen, and a warehouse at 22:00 with an unlisted plug
 * must not need someone woken up. Changing or removing an existing row is
 * another matter — see `updateConnector` and `deleteConnector`.
 */
async function requireCatalogAdmin() {
	const user = await requireAuth();
	if (await isSystemAdmin(user.id)) return user;
	const managed = await managedOrgIds(user.id);
	if (managed.length === 0) {
		error(403, 'You need admin rights in one of your organisations to edit connectors');
	}
	return user;
}

const connectorInputSchema = v.object({
	name: v.pipe(v.string(), v.trim(), v.minLength(1)),
	/** What it mates with. Blank falls back to the name — a family of one. */
	family: v.optional(v.nullable(v.string())),
	/** Stecker or Buchse — the mechanical fit, and the one with a rule attached. */
	form: v.optional(v.nullable(v.picklist(['plug', 'socket']))),
	/** What the contacts are. Not the same question as `form`. */
	gender: v.optional(v.nullable(v.picklist(['male', 'female']))),
	/** The department a cable ending in this belongs to. A prefill, not a rule. */
	categoryId: v.optional(v.nullable(v.string())),
	imagePath: v.optional(v.nullable(v.string()))
});

export const createConnector = command(connectorInputSchema, async (input) => {
	await requireCatalogAdmin();
	const name = input.name.trim();
	const slug = connectorSlug(name);

	// A connector already exists for most names by the time anyone opens this
	// form — the product write paths create rows on save. Adopting the existing
	// row instead of failing is what makes "create" safe to offer for a name the
	// picker merely hasn't loaded yet.
	// A connector with no family stated is a family of one — an NL4, a USB-C,
	// anything that only ever mates with itself. Storing the name rather than
	// null keeps "how many members does this family have?" a plain count.
	const family = input.family?.trim() || name;
	const form = input.form ?? null;
	const gender = input.gender ?? null;
	const categoryId = input.categoryId?.trim() || null;
	const imagePath = input.imagePath?.trim() || null;

	const existing = await prisma.connector.findUnique({ where: { slug } });
	const connector = existing
		? await prisma.connector.update({
				where: { id: existing.id },
				// What the caller brought wins over nothing, but never clears
				// something: this path is reached by typing a name that already has a
				// row, and that row may be better filled in than this form was.
				data: {
					name,
					family,
					...(form ? { form } : {}),
					...(gender ? { gender } : {}),
					...(categoryId ? { categoryId } : {}),
					...(imagePath ? { imagePath } : {})
				}
			})
		: await prisma.connector.create({
				data: { name, slug, family, form, gender, categoryId, imagePath }
			});

	await getConnectors().refresh();
	return connector;
});

const updateConnectorSchema = v.object({
	connectorId: v.string(),
	...connectorInputSchema.entries
});

/**
 * Rewriting a row every organization's catalogue points at is a system-admin
 * job — this is the shared vocabulary, and a rename here changes what a cable
 * is called in somebody else's warehouse.
 */
export const updateConnector = command(updateConnectorSchema, async (input) => {
	await requireSystemAdmin();
	const name = input.name.trim();
	const slug = connectorSlug(name);

	const clash = await prisma.connector.findUnique({ where: { slug } });
	if (clash && clash.id !== input.connectorId) {
		error(409, `A connector called "${clash.name}" already exists.`);
	}

	const connector = await prisma.connector.update({
		where: { id: input.connectorId },
		data: {
			name,
			slug,
			family: input.family?.trim() || name,
			form: input.form ?? null,
			gender: input.gender ?? null,
			categoryId: input.categoryId?.trim() || null,
			imagePath: input.imagePath?.trim() || null
		}
	});
	await getConnectors().refresh();
	return connector;
});

/**
 * How many products name this connector on either end. `Product.connectorA` is
 * a string, not a foreign key — the whole point is that a product can name a
 * connector nobody has catalogued — so this is counted, not enforced, and it is
 * what the admin page shows before offering to delete a row.
 */
export const getConnectorUsage = query(async () => {
	await requireAuth();
	const rows = await prisma.product.findMany({
		where: { OR: [{ connectorA: { not: null } }, { connectorB: { not: null } }] },
		select: { connectorA: true, connectorB: true }
	});
	const counts: Record<string, number> = {};
	for (const row of rows) {
		// A cable with the same connector at both ends is one product using it,
		// not two.
		for (const slug of new Set(
			[row.connectorA, row.connectorB].flatMap((n) => (n?.trim() ? [connectorSlug(n)] : []))
		)) {
			counts[slug] = (counts[slug] ?? 0) + 1;
		}
	}
	return counts;
});

export const deleteConnector = command(v.string(), async (connectorId: string) => {
	await requireSystemAdmin();
	const connector = await prisma.connector.findUniqueOrThrow({ where: { id: connectorId } });

	// Deleting the row does not break the products that name it — they hold the
	// string — but it does throw away the picture and the family, and they would
	// silently get a fresh guessed row the next time one of them is saved.
	const inUse = await prisma.product.count({
		where: {
			OR: [
				{ connectorA: { equals: connector.name, mode: 'insensitive' } },
				{ connectorB: { equals: connector.name, mode: 'insensitive' } }
			]
		}
	});
	if (inUse > 0) {
		error(409, `${inUse} product(s) still use this connector. Rename it instead of deleting it.`);
	}

	await prisma.connector.delete({ where: { id: connectorId } });
	await getConnectors().refresh();
	await getConnectorUsage().refresh();
	return { id: connectorId };
});
