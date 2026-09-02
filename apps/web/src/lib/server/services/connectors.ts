import { prisma } from '$lib/server/auth';
import { connectorBase } from '$lib/cable';

/**
 * The unique key a connector is filed under. Everything about a connector is
 * free text except this: it is what stops "Schuko M", "schuko m" and "SCHUKO M"
 * becoming three rows describing one plug.
 */
export function connectorSlug(name: string): string {
	return name.trim().toLowerCase();
}

/**
 * Gives every named connector a row, creating the ones that have none.
 *
 * Called from every path that writes `Product.connectorA/B`, because the
 * product fields are still free text by design — a connector nobody has
 * catalogued is accepted, and the row is what it accumulates against
 * afterwards. So the table can never be a gate in front of registering
 * equipment; it only ever catches up.
 *
 * Returns the names it created, so the caller can refresh `getConnectors` —
 * a service has no business knowing which queries a remote layer caches.
 */
export async function ensureConnectors(names: (string | null | undefined)[]): Promise<string[]> {
	const wanted = new Map<string, string>();
	for (const name of names) {
		const trimmed = name?.trim();
		if (!trimmed) continue;
		const slug = connectorSlug(trimmed);
		if (!wanted.has(slug)) wanted.set(slug, trimmed);
	}
	if (wanted.size === 0) return [];

	const existing = await prisma.connector.findMany({
		where: { slug: { in: [...wanted.keys()] } },
		select: { slug: true }
	});
	for (const row of existing) wanted.delete(row.slug);
	if (wanted.size === 0) return [];

	// `skipDuplicates` rather than a transaction: two people registering the
	// same new connector at the same moment is a race worth losing quietly.
	await prisma.connector.createMany({
		// The family is guessed from the name the same way `cableDisplayName`
		// guesses it without a catalogue, so a row created here behaves as the
		// heuristic already did. It is visible and editable in the connector form,
		// which is where a wrong guess gets corrected.
		data: [...wanted].map(([slug, name]) => ({ name, slug, family: connectorBase(name) })),
		skipDuplicates: true
	});
	return [...wanted.values()];
}
