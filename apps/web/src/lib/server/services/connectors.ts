import { prisma } from '$lib/server/auth';
import { connectorFamily } from '$lib/cable';

/**
 * The unique key a connector is filed under. Everything about a connector is
 * free text except this: it is what stops "Schuko M", "schuko m" and "SCHUKO M"
 * becoming three rows describing one plug.
 */
export function connectorSlug(name: string): string {
	return name.trim().toLowerCase();
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
			// `skipDuplicates` rather than a transaction: two people registering
			// the same new connector at the same moment is a race worth losing
			// quietly — the read below finds whichever row won.
			const result = await prisma.connector.createMany({
				// The family is guessed the way the connector form prefills it. It is
				// visible and editable there, which is where a wrong guess gets
				// corrected.
				data: missing.map(([slug, name]) => ({ name, slug, family: connectorFamily(name) })),
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
