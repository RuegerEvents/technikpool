import { query, command } from '$app/server';
import * as v from 'valibot';
import { prisma } from '$lib/server/auth';
import {
	isSystemAdmin,
	managedOrgIds,
	requireAuth,
	requireSystemAdmin
} from '$lib/server/services/access';
import { connectorSlug } from '$lib/server/services/connectors';
import { appError } from '$lib/errors';
import { connectorFamily } from '$lib/cable';

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
		appError(403, 'connector_edit_forbidden');
	}
	return user;
}

const connectorInputSchema = v.object({
	name: v.pipe(v.string(), v.trim(), v.minLength(1)),
	/** The connector system, without the end: TRUE1 for TRUE1 M. Blank falls back to the name's first word. */
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

	const family = input.family?.trim() || null;
	const form = input.form ?? null;
	const gender = input.gender ?? null;
	const categoryId = input.categoryId?.trim() || null;
	const imagePath = input.imagePath?.trim() || null;

	const existing = await prisma.connector.findUnique({ where: { slug } });
	if (!existing) {
		const connector = await prisma.connector.create({
			// A family is always stored, so "how many members does this family
			// have?" stays a plain count. Unstated, it is the first word of the
			// name, as the form prefills it.
			data: {
				name,
				slug,
				family: family ?? connectorFamily(name),
				form,
				gender,
				categoryId,
				imagePath
			}
		});
		await getConnectors().refresh();
		return connector;
	}

	// A connector already exists for most names by the time anyone opens this
	// form — the product write paths create rows on save, and the picker may
	// not have loaded it yet. So a name that is taken is adopted, not refused,
	// but only ever *filled in*: this is the org-admin door, and changing what
	// a shared row already says is `updateConnector`'s, which is system-admin.
	// A form that contradicts the row is someone describing a different
	// connector under a name already in use — an XLR3 M Einbaubuchse typed as
	// "XLR3 M" once turned every XLR3 M cable end into a socket — so it is
	// refused, never merged.
	const wanted = { family, form, gender, categoryId, imagePath };
	const fill: Partial<Record<keyof typeof wanted, string>> = {};
	for (const key of Object.keys(wanted) as (keyof typeof wanted)[]) {
		const value = wanted[key];
		if (value === null || value === existing[key]) continue;
		if (existing[key] !== null) appError(409, 'connector_exists_different', [existing.name]);
		fill[key] = value;
	}

	const connector =
		Object.keys(fill).length > 0
			? await prisma.connector.update({ where: { id: existing.id }, data: fill })
			: existing;

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
 * is called in somebody else's warehouse. Which it does, at once: cables hold
 * the row's id, not a copy of its name.
 */
export const updateConnector = command(updateConnectorSchema, async (input) => {
	await requireSystemAdmin();
	const name = input.name.trim();
	const slug = connectorSlug(name);

	const clash = await prisma.connector.findUnique({ where: { slug } });
	if (clash && clash.id !== input.connectorId) {
		appError(409, 'connector_exists', [clash.name]);
	}

	const connector = await prisma.connector.update({
		where: { id: input.connectorId },
		data: {
			name,
			slug,
			family: input.family?.trim() || connectorFamily(name),
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
 * The products that use a connector: a cable ending in it, a loom with a way
 * ending in it, a device with it built in. The same filter serves the count on
 * the admin page and the guard on delete, so the two cannot disagree.
 */
function usedBy(connectorId: string) {
	return {
		OR: [
			{ connectorAId: connectorId },
			{ connectorBId: connectorId },
			{ ways: { some: { OR: [{ connectorAId: connectorId }, { connectorBId: connectorId }] } } },
			{ ports: { some: { connectorId } } }
		]
	};
}

/**
 * How many products use each connector, keyed by slug — what the admin page
 * shows before offering to delete a row. A product counts once however many of
 * its ends, ways or panel lines are that connector.
 */
export const getConnectorUsage = query(async () => {
	await requireAuth();
	const products = await prisma.product.findMany({
		where: {
			OR: [
				{ connectorAId: { not: null } },
				{ connectorBId: { not: null } },
				{ ways: { some: {} } },
				{ ports: { some: {} } }
			]
		},
		select: {
			connectorAId: true,
			connectorBId: true,
			ways: { select: { connectorAId: true, connectorBId: true } },
			ports: { select: { connectorId: true } }
		}
	});
	const byId = new Map<string, number>();
	for (const product of products) {
		const ids = new Set([
			product.connectorAId,
			product.connectorBId,
			...product.ways.flatMap((w) => [w.connectorAId, w.connectorBId]),
			...product.ports.map((p) => p.connectorId)
		]);
		for (const id of ids) if (id) byId.set(id, (byId.get(id) ?? 0) + 1);
	}
	const connectors = await prisma.connector.findMany({ select: { id: true, slug: true } });
	const counts: Record<string, number> = {};
	for (const c of connectors) {
		const used = byId.get(c.id);
		if (used) counts[c.slug] = used;
	}
	return counts;
});

export const deleteConnector = command(v.string(), async (connectorId: string) => {
	await requireSystemAdmin();
	await prisma.connector.findUniqueOrThrow({ where: { id: connectorId } });

	// Every use holds a foreign key that restricts the delete; counting first is
	// what turns that into a message instead of a bare 500.
	const inUse = await prisma.product.count({ where: usedBy(connectorId) });
	if (inUse > 0) {
		appError(409, 'connector_in_use', [inUse]);
	}

	await prisma.connector.delete({ where: { id: connectorId } });
	await getConnectors().refresh();
	await getConnectorUsage().refresh();
	return { id: connectorId };
});
