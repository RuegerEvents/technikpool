import { prisma } from '$lib/server/auth';
import { normalizeWays, type CableWayAttrs } from '$lib/cable';
import { ensureConnectors } from '$lib/server/services/connectors';
import { CABLE_WAYS } from '$lib/server/services/cable-ends';

/**
 * A loom's ways, server side. The shape the forms send is the shape the catalog
 * log records: names, not connector ids. A logged id could point at a row that
 * has since been deleted, while a name is resolved (or re-created) on revert.
 */
export type WayInput = CableWayAttrs;

export async function waySnapshot(productId: string): Promise<WayInput[]> {
	const ways = await prisma.cableWay.findMany({ where: { productId }, ...CABLE_WAYS });
	return ways.map((w) => ({
		count: w.count,
		cableType: w.cableType,
		connectorA: w.connectorARef?.name ?? null,
		connectorB: w.connectorBRef?.name ?? null
	}));
}

/**
 * Replaces a product's whole loom. Wholesale like `writePorts`, and for the
 * same reason: the ways are edited as one thing, and a partial write would
 * leave a cable with half of its old make-up and half of the new one.
 *
 * Returns the connector names it had to create, so the caller can refresh the
 * catalogue.
 */
export async function writeWays(productId: string, ways: readonly WayInput[]) {
	const rows = normalizeWays(ways);
	const connectors = await ensureConnectors(rows.flatMap((w) => [w.connectorA, w.connectorB]));
	await prisma.$transaction(async (tx) => {
		await tx.cableWay.deleteMany({ where: { productId } });
		if (rows.length > 0) {
			await tx.cableWay.createMany({
				data: rows.map((w, sortOrder) => ({ ...connectors.ends(w), productId, sortOrder }))
			});
		}
	});
	return connectors.created;
}
