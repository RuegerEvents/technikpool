import { prisma } from '#lib/server/auth.js';
import { connectorsMate, type ConnectorRow } from '#lib/cable.js';
import { naturalCompare } from '#lib/sort.js';
import { portFlow, portRequirement } from '#lib/ports.js';

// The production's connection check: does every device on the list have a
// cable for each port it cannot run without, and does every cable's far end
// have somewhere to go? A hint, never a gate — a cable can come from the
// venue, a desk can be the house's — so it reports and blocks nothing.
//
// Counted, not wired: nobody records which cable goes where, so the question
// is whether *some* assignment of the cables on the list covers every required
// port, which is a bipartite matching. Every unit of the production counts as
// it will be on site, whichever org it belongs to.

/** One kind of connector, as the check compares them. */
type Connector = ConnectorRow & { id: string };

type DevicePort = {
	connectorId: string;
	count: number;
	label: string | null;
	requirement: string | null;
	direction: 'in' | 'out' | null;
};

export type CheckDevice = {
	unitId: string;
	productName: string;
	/** Carried through to the finding, for its thumbnail. */
	imagePath?: string | null;
	ports: DevicePort[];
};
/** One way of a cable — a lead has one, a loom one per pair it carries. */
export type CheckCable = { unitId: string; ends: [string | null, string | null] };

/** Required ports of one product that no cable on the list fits. */
export type UnfedFinding = {
	productName: string;
	imagePath: string | null;
	/** The connectors the cable may plug into — two or more for a group. */
	connectors: string[];
	label: string | null;
	needed: number;
	missing: number;
};

/**
 * Cable ends that plug into a device's output — a link lead's far end — with
 * fewer free outputs on the list than there are such ends.
 */
export type UnsourcedFinding = { connector: string; missing: number };

export type ConnectionCheck = {
	/** Required connections on the list, and how many a cable covers. */
	required: number;
	covered: number;
	unfed: UnfedFinding[];
	unsourced: UnsourcedFinding[];
};

/** A required connection: one cable on any of `alternatives`. */
type Slot = { unitId: string; key: string; alternatives: string[] };
type Leg = { unitId: string; ends: [string | null, string | null]; plain: boolean };
type Source = { unitId: string; connectorId: string };

/**
 * Kuhn's augmenting paths. Small enough for any production — a few hundred
 * ports against a few hundred cables — and the order of `edges` is a
 * preference: earlier candidates are tried first, so a plain lead is used
 * before an adapter where either would do.
 */
function maxMatching(left: number, edges: (i: number) => number[]): Map<number, number> {
	const owner = new Map<number, number>();
	const tryAssign = (i: number, seen: Set<number>): boolean => {
		for (const j of edges(i)) {
			if (seen.has(j)) continue;
			seen.add(j);
			const current = owner.get(j);
			if (current === undefined || tryAssign(current, seen)) {
				owner.set(j, i);
				return true;
			}
		}
		return false;
	};
	for (let i = 0; i < left; i++) tryAssign(i, new Set());
	return owner;
}

export function checkConnections(
	devices: readonly CheckDevice[],
	cables: readonly CheckCable[],
	connectors: readonly Connector[]
): ConnectionCheck {
	const byId = new Map(connectors.map((c) => [c.id, c]));
	const mateCache = new Map<string, boolean>();
	const mates = (a: string | null, b: string | null) => {
		if (!a || !b) return false;
		const key = `${a}|${b}`;
		let answer = mateCache.get(key);
		if (answer === undefined) {
			const ca = byId.get(a);
			const cb = byId.get(b);
			answer = !!ca && !!cb && connectorsMate(ca, cb, connectors);
			mateCache.set(key, answer);
		}
		return answer;
	};
	const familyOf = (id: string | null) => (id ? byId.get(id)?.family : null) ?? id;

	// What has to be connected. A group (A, B) is as many connections as its
	// smallest line counts: "1× XLR3 M or 1× XLR5 M" is one DMX input, and a
	// dual-universe fixture with two of each is two.
	const slots: Slot[] = [];
	const lines = new Map<string, Omit<UnfedFinding, 'missing'>>();
	const sources: Source[] = [];
	for (const device of devices) {
		const groups = new Map<string, DevicePort[]>();
		for (const port of device.ports) {
			if (port.direction === 'out') {
				for (let n = 0; n < port.count; n++) {
					sources.push({ unitId: device.unitId, connectorId: port.connectorId });
				}
			}
			if (!port.requirement) continue;
			const groupKey =
				port.requirement === 'required' ? `${port.connectorId}#${groups.size}` : port.requirement;
			groups.set(groupKey, [...(groups.get(groupKey) ?? []), port]);
		}
		for (const ports of groups.values()) {
			const alternatives = [...new Set(ports.map((p) => p.connectorId))];
			const key = `${device.productName}|${alternatives.join(',')}`;
			const count = Math.min(...ports.map((p) => p.count));
			for (let n = 0; n < count; n++) {
				slots.push({ unitId: device.unitId, key, alternatives });
			}
			const line = lines.get(key) ?? {
				productName: device.productName,
				imagePath: device.imagePath ?? null,
				connectors: alternatives.map((id) => byId.get(id)?.name ?? id),
				label: ports.find((p) => p.label)?.label ?? null,
				needed: 0
			};
			line.needed += count;
			lines.set(key, line);
		}
	}

	const legs: Leg[] = cables.map((c) => ({
		...c,
		plain: familyOf(c.ends[0]) === familyOf(c.ends[1])
	}));
	// Plain leads before adapters and converters, so an adapter is only spent
	// where nothing else fits.
	const legOrder = legs.map((_, j) => j).sort((x, y) => +legs[y].plain - +legs[x].plain);
	const fits = (slot: Slot, leg: Leg) =>
		slot.alternatives.some((alt) => mates(alt, leg.ends[0]) || mates(alt, leg.ends[1]));

	const fed = maxMatching(slots.length, (i) => legOrder.filter((j) => fits(slots[i], legs[j])));
	const usedLegs = new Set(fed.keys());

	const missingByKey = new Map<string, number>();
	const fedSlots = new Set(fed.values());
	slots.forEach((slot, i) => {
		if (!fedSlots.has(i)) missingByKey.set(slot.key, (missingByKey.get(slot.key) ?? 0) + 1);
	});

	// Where each feeding cable's other end goes. Into a device's output where
	// one fits (not the device it feeds — a fixture does not feed itself), else
	// on through another cable on the list (an adapter, an extension), else
	// out of the list altogether: the wall, the house desk. That last one is
	// only believable for a connector no output on the list takes, and not for
	// a link lead into a family the devices use — eight TRUE1 link leads with
	// three TRUE1 outs between the fixtures are five leads with nowhere to go,
	// and so are TRUE1 link leads on a list with no TRUE1 out at all. A feed
	// that changes family on the way (Schuko → TRUE1) goes to the wall.
	type FarEnd = { connectorId: string; awayFrom: string; plain: boolean };
	const farEnds: FarEnd[] = [];
	for (const [j, i] of fed) {
		const leg = legs[j];
		const near = slots[i].alternatives.some((alt) => mates(alt, leg.ends[0])) ? 0 : 1;
		const far = leg.ends[1 - near];
		if (far) farEnds.push({ connectorId: far, awayFrom: slots[i].unitId, plain: leg.plain });
	}

	const plugged = maxMatching(farEnds.length, (i) =>
		sources
			.map((_, k) => k)
			.filter(
				(k) =>
					sources[k].unitId !== farEnds[i].awayFrom &&
					mates(farEnds[i].connectorId, sources[k].connectorId)
			)
	);
	const freeSources = new Set(sources.map((_, k) => k).filter((k) => !plugged.has(k)));
	const pluggedEnds = new Set(plugged.values());

	const deviceFamilies = new Set(
		devices.flatMap((d) => d.ports.map((p) => familyOf(p.connectorId)))
	);
	const unsourced = new Map<string, number>();
	farEnds.forEach((end, i) => {
		if (pluggedEnds.has(i)) return;
		let connectorId: string | null = end.connectorId;
		let plain = end.plain;
		// A chain is short in practice — an adapter, a lead, an adapter.
		for (let depth = 0; connectorId && depth < 4; depth++) {
			const here: string = connectorId;
			const source = [...freeSources].find(
				(k) => sources[k].unitId !== end.awayFrom && mates(here, sources[k].connectorId)
			);
			if (source !== undefined) {
				freeSources.delete(source);
				return;
			}
			const next = legOrder.find(
				(j) => !usedLegs.has(j) && (mates(here, legs[j].ends[0]) || mates(here, legs[j].ends[1]))
			);
			if (next === undefined) break;
			usedLegs.add(next);
			const leg = legs[next];
			connectorId = mates(here, leg.ends[0]) ? leg.ends[1] : leg.ends[0];
			plain = leg.plain;
		}
		const last = connectorId;
		if (!last) return;
		const onTheList =
			sources.some((s) => mates(last, s.connectorId)) ||
			(plain && deviceFamilies.has(familyOf(last)));
		if (onTheList) unsourced.set(last, (unsourced.get(last) ?? 0) + 1);
	});

	return {
		required: slots.length,
		covered: fed.size,
		unfed: [...missingByKey]
			.map(([key, missing]) => ({ ...lines.get(key)!, missing }))
			.sort((a, b) => naturalCompare(a.productName, b.productName)),
		unsourced: [...unsourced]
			.map(([id, missing]) => ({ connector: byId.get(id)?.name ?? id, missing }))
			.sort((a, b) => naturalCompare(a.connector, b.connector))
	};
}

/** Statuses that will not be on site — the rest all count, drafts included. */
const OFF_THE_LIST = ['DECLINED', 'CANCELLED'];

/** Loads a production's units and runs `checkConnections` over them. */
export async function productionConnectionCheck(productionId: string): Promise<ConnectionCheck> {
	const [items, connectors, categories] = await Promise.all([
		prisma.productionItem.findMany({
			where: { productionId, status: { notIn: OFF_THE_LIST } },
			select: {
				assetId: true,
				asset: {
					select: {
						product: {
							select: {
								name: true,
								imagePath: true,
								categoryId: true,
								connectorAId: true,
								connectorBId: true,
								ways: { select: { count: true, connectorAId: true, connectorBId: true } },
								ports: {
									select: {
										connectorId: true,
										count: true,
										label: true,
										requirement: true,
										connector: true
									}
								}
							}
						}
					}
				}
			}
		}),
		prisma.connector.findMany({ select: { id: true, name: true, family: true, gender: true } }),
		prisma.category.findMany({ select: { id: true, cableInputGender: true } })
	]);

	const devices: CheckDevice[] = [];
	const cables: CheckCable[] = [];
	for (const item of items) {
		const product = item.asset.product;
		if (product.ports.length > 0) {
			devices.push({
				unitId: item.assetId,
				productName: product.name,
				imagePath: product.imagePath,
				ports: product.ports.map((p) => ({
					connectorId: p.connectorId,
					count: p.count,
					label: p.label,
					requirement: portRequirement(p.requirement),
					direction: portFlow(p.connector, product.categoryId, categories)?.direction ?? null
				}))
			});
		}
		if (product.connectorAId || product.connectorBId) {
			cables.push({ unitId: item.assetId, ends: [product.connectorAId, product.connectorBId] });
		}
		for (const way of product.ways) {
			for (let n = 0; n < way.count; n++) {
				cables.push({ unitId: item.assetId, ends: [way.connectorAId, way.connectorBId] });
			}
		}
	}
	return checkConnections(devices, cables, connectors);
}
