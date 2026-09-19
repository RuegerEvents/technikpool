import { prisma } from '$lib/server/auth';
import { appError } from '$lib/errors';

/** One line of a device's panel as the forms send it. */
export type PortInput = { connectorId: string; count: number; label: string | null };

/**
 * One line of a device's panel as the catalog log records it. The connector's
 * name travels alongside its id because the log has to stay readable after a
 * rename or a delete; the id is what a revert matches and writes.
 */
export type PortSnapshot = PortInput & { connector: string };

export async function portSnapshot(productId: string): Promise<PortSnapshot[]> {
	const ports = await prisma.productPort.findMany({
		where: { productId },
		include: { connector: { select: { name: true } } },
		orderBy: { sortOrder: 'asc' }
	});
	return ports.map((p) => ({
		connectorId: p.connectorId,
		connector: p.connector.name,
		count: p.count,
		label: p.label
	}));
}

/**
 * Whether two panels are the same list. Order counts: it is the order the
 * device's panel reads in, and moving a line is a change like any other.
 */
export function samePorts(a: readonly PortInput[], b: readonly PortInput[]): boolean {
	return (
		a.length === b.length &&
		a.every(
			(p, i) =>
				p.connectorId === b[i].connectorId &&
				p.count === b[i].count &&
				(p.label ?? null) === (b[i].label ?? null)
		)
	);
}

/** Trims labels and drops lines without a connector, so '' and null compare equal. */
export function normalizePorts(ports: readonly PortInput[]): PortInput[] {
	return ports
		.filter((p) => p.connectorId)
		.map((p) => ({
			connectorId: p.connectorId,
			count: Math.max(1, Math.round(p.count)),
			label: p.label?.trim() || null
		}));
}

/**
 * Replaces a product's whole panel. Wholesale rather than line by line because
 * the list is edited as one thing, and a partial write would leave a device
 * with half of its old panel and half of the new one.
 */
export async function writePorts(productId: string, ports: readonly PortInput[]) {
	const connectorIds = [...new Set(ports.map((p) => p.connectorId))];
	const found = await prisma.connector.count({ where: { id: { in: connectorIds } } });
	if (found !== connectorIds.length) appError(404, 'connector_not_found');

	await prisma.$transaction(async (tx) => {
		await tx.productPort.deleteMany({ where: { productId } });
		await tx.productPort.createMany({
			data: ports.map((p, sortOrder) => ({ ...p, productId, sortOrder }))
		});
	});
}
