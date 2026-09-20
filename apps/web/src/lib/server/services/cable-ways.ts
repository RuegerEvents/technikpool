import { prisma } from '$lib/server/auth';
import { normalizeWays, type CableWayAttrs } from '$lib/cable';

/**
 * A loom's ways, server side. The shape the forms send is the shape the catalog
 * log records — unlike a device's panel, a way has no foreign key that could go
 * stale, so there is nothing to keep beside it for readability.
 */
export type WayInput = CableWayAttrs;

export async function waySnapshot(productId: string): Promise<WayInput[]> {
	const ways = await prisma.cableWay.findMany({
		where: { productId },
		orderBy: { sortOrder: 'asc' }
	});
	return ways.map((w) => ({
		count: w.count,
		cableType: w.cableType,
		connectorA: w.connectorA,
		connectorB: w.connectorB
	}));
}

/**
 * Replaces a product's whole loom. Wholesale like `writePorts`, and for the
 * same reason: the ways are edited as one thing, and a partial write would
 * leave a cable with half of its old make-up and half of the new one.
 */
export async function writeWays(productId: string, ways: readonly WayInput[]) {
	const rows = normalizeWays(ways);
	await prisma.$transaction(async (tx) => {
		await tx.cableWay.deleteMany({ where: { productId } });
		if (rows.length > 0) {
			await tx.cableWay.createMany({
				data: rows.map((w, sortOrder) => ({ ...w, productId, sortOrder }))
			});
		}
	});
}
