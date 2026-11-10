import { prisma } from '#lib/server/auth.js';
import { connectorFamily } from '#lib/cable.js';
import { appError } from '#lib/errors.js';
import { isSystemAdmin } from '#lib/server/services/access.js';

/**
 * The unique key a connector is filed under. Everything about a connector is
 * free text except this: it is what stops "Schuko M", "schuko m" and "SCHUKO M"
 * becoming three rows describing one plug.
 */
export function connectorSlug(name: string): string {
	return name.trim().toLowerCase();
}

/**
 * Whether two connector names are the same connector — the way its slug files
 * it. "schuko m" typed into a form is the "Schuko M" already stored, and is
 * stored as that; it is no edit, and needs no right to make one.
 */
export function sameConnectorName(a: string | null, b: string | null): boolean {
	return (a ? connectorSlug(a) : null) === (b ? connectorSlug(b) : null);
}

type Ends = { connectorA: string | null; connectorB: string | null };
type EndIds = { connectorAId: string | null; connectorBId: string | null };

export type ConnectorRefs = {
	/** The names this call gave a row for the first time, for refreshing `getConnectors`. */
	created: string[];
	/**
	 * A cable's (or a way's) ends as they are stored: the names swapped for the
	 * ids of their connector rows. Everything else on `value` passes through.
	 */
	ends<T extends Ends>(value: T): Omit<T, keyof Ends> & EndIds;
	/**
	 * A name as the catalogue spells it — "schuko m" typed into a form is the
	 * "Schuko M" stored. What gets compared and logged.
	 */
	name(name: string | null): string | null;
};

/**
 * Gives every named connector a row, creating the ones that have none, and
 * returns what a write needs to point at them.
 *
 * Called before every write of `connectorA/B`, because forms send names — a
 * connector nobody has catalogued is accepted, and gets its row here. So the
 * table can never be a gate in front of registering equipment.
 *
 * Reports what it created rather than refreshing anything itself: a service
 * has no business knowing which queries a remote layer caches.
 */
/**
 * Whether a new connector of this family carries mains voltage: it does if any
 * connector of the family already does, so "TRUE1 TOP" comes in marked like
 * "TRUE1 M". A family nobody has marked yet starts unmarked.
 */
export async function familyIsMains(families: readonly string[]) {
	const rows = await prisma.connector.findMany({
		where: { mains: true, family: { in: [...families], mode: 'insensitive' } },
		select: { family: true }
	});
	const marked = new Set(rows.map((r) => r.family?.toLowerCase()));
	return (family: string) => marked.has(family.toLowerCase());
}

export async function ensureConnectors(
	names: readonly (string | null | undefined)[]
): Promise<ConnectorRefs> {
	const wanted = new Map<string, string>();
	for (const name of names) {
		const trimmed = name?.trim();
		if (!trimmed) continue;
		const slug = connectorSlug(trimmed);
		if (!wanted.has(slug)) wanted.set(slug, trimmed);
	}

	const rows = new Map<string, { id: string; name: string }>();
	const created: string[] = [];
	if (wanted.size > 0) {
		const existing = await prisma.connector.findMany({
			where: { slug: { in: [...wanted.keys()] } },
			select: { slug: true }
		});
		const missing = [...wanted].filter(([slug]) => !existing.some((row) => row.slug === slug));
		if (missing.length > 0) {
			const mains = await familyIsMains(missing.map(([, name]) => connectorFamily(name)));
			// `skipDuplicates` rather than a transaction: two people registering
			// the same new connector at the same moment is a race worth losing
			// quietly — the read below finds whichever row won.
			const result = await prisma.connector.createMany({
				// The family is guessed the way the connector form prefills it. It is
				// visible and editable there, which is where a wrong guess gets
				// corrected.
				data: missing.map(([slug, name]) => {
					const family = connectorFamily(name);
					return { name, slug, family, mains: mains(family) };
				}),
				skipDuplicates: true
			});
			if (result.count > 0) created.push(...missing.map(([, name]) => name));
		}
		for (const row of await prisma.connector.findMany({
			where: { slug: { in: [...wanted.keys()] } },
			select: { id: true, name: true, slug: true }
		})) {
			rows.set(row.slug, { id: row.id, name: row.name });
		}
	}

	const end = (name: string | null) => {
		const row = name?.trim() ? rows.get(connectorSlug(name)) : undefined;
		return row ?? { id: null, name: null };
	};
	return {
		created,
		ends(value) {
			const { connectorA, connectorB, ...rest } = value;
			return { ...rest, connectorAId: end(connectorA).id, connectorBId: end(connectorB).id };
		},
		name: (name) => end(name).name
	};
}

/**
 * Whether a connector carries mains voltage, which is what makes a device or
 * cable with it need DGUV inspections. Shared vocabulary, so system admin.
 * Products are not re-flagged by this: `MainsHint` offers that per product.
 */
export async function setConnectorMains(userId: string, connectorId: string, mains: boolean) {
	if (!(await isSystemAdmin(userId))) appError(403, 'admin_required');
	return await prisma.connector.update({ where: { id: connectorId }, data: { mains } });
}

/**
 * How many products use each connector, by connector id: a cable ending in it,
 * a loom with a way ending in it, a device with it built in. A product counts
 * once however many of its ends, ways or panel lines are that connector.
 */
export async function connectorProductCounts() {
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
	return byId;
}
