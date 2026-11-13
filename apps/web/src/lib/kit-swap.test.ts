import { describe, expect, it } from 'vitest';
import {
	bookedKitItems,
	compareKitNumbers,
	kitSwapDecision,
	kitSwapPlan,
	wholeKits,
	type BookedKit,
	type KitBookingItem,
	type ScannedKit
} from './kit-swap';

const item = (
	id: string,
	sourceBundleId: string | null,
	bundleId: string | null,
	extra: Partial<KitBookingItem> & { parentBundleId?: string | null } = {}
): KitBookingItem => {
	const { parentBundleId = null, ...rest } = extra;
	return {
		id,
		assetId: `asset-${id}`,
		status: 'APPROVED',
		sourceBundleId,
		sourceParentAssetId: null,
		packedInItemId: null,
		asset: { bundleId, bundle: bundleId ? { parentBundleId } : null },
		...rest
	};
};

const booked = (id: string, number: string | null, statuses = ['APPROVED']): BookedKit => ({
	id,
	templateId: 'dmx-ring',
	organizationId: 'org',
	number,
	items: statuses.map((status) => ({ status }))
});

const ring2: ScannedKit = {
	id: 'ring2',
	templateId: 'dmx-ring',
	organizationId: 'org',
	bookedHere: false,
	unavailable: false
};

describe('bookedKitItems', () => {
	it('groups the items by the kit they were booked as', () => {
		const kits = bookedKitItems([item('a', 'ring1', 'ring1'), item('b', 'ring1', 'ring1')]);
		expect(kits.get('ring1')?.map((i) => i.id)).toEqual(['a', 'b']);
	});

	it('counts an inner kit booked through its outer one as booked too', () => {
		const kits = bookedKitItems([
			item('case', 'foh1', 'foh1'),
			item('adapter', 'foh1', 'powercon1', { parentBundleId: 'foh1' })
		]);
		expect(kits.get('foh1')?.map((i) => i.id)).toEqual(['case', 'adapter']);
		expect(kits.get('powercon1')?.map((i) => i.id)).toEqual(['adapter']);
	});

	it('leaves out loose units, units moved out of the kit, and released bookings', () => {
		const kits = bookedKitItems([
			item('loose', null, null),
			item('moved', 'ring1', 'ring3'),
			item('declined', 'ring1', 'ring1', { status: 'DECLINED' })
		]);
		expect(kits.size).toBe(0);
	});
});

describe('compareKitNumbers', () => {
	it('sorts numbers naturally and kits without one last', () => {
		const kits = [booked('x', null), booked('b', 'Ring 10'), booked('a', 'Ring 2')];
		expect(kits.sort(compareKitNumbers).map((k) => k.id)).toEqual(['a', 'b', 'x']);
	});
});

describe('kitSwapDecision', () => {
	it('moves the booking of a booked kit of the same type onto the scanned one', () => {
		expect(kitSwapDecision(ring2, [booked('ring1', 'R1')])).toEqual({
			kind: 'replace',
			kit: booked('ring1', 'R1')
		});
	});

	it('picks the lowest number among several', () => {
		const decision = kitSwapDecision(ring2, [booked('ring10', 'R10'), booked('ring3', 'R3')]);
		expect(decision.kind === 'replace' && decision.kit.id).toBe('ring3');
	});

	it('passes over a started kit for one nothing has gone out of yet', () => {
		const decision = kitSwapDecision(ring2, [
			booked('ring1', 'R1', ['APPROVED', 'CHECKED_OUT']),
			booked('ring3', 'R3')
		]);
		expect(decision.kind === 'replace' && decision.kit.id).toBe('ring3');
	});

	it('refuses when every booked kit of the type is started', () => {
		expect(kitSwapDecision(ring2, [booked('ring1', 'R1', ['APPROVED', 'CHECKED_OUT'])])).toEqual({
			kind: 'refused',
			reason: 'started',
			kit: booked('ring1', 'R1', ['APPROVED', 'CHECKED_OUT'])
		});
		expect(kitSwapDecision(ring2, [booked('ring1', 'R1', ['RETURNED'])]).kind === 'refused').toBe(
			true
		);
	});

	it('ignores "not interchangeable": a whole kit keeps its pairs together', () => {
		expect(kitSwapDecision(ring2, [booked('r1', 'R1')]).kind).toBe('replace');
	});

	it('refuses a kit that is not wholly free', () => {
		const decision = kitSwapDecision({ ...ring2, unavailable: true }, [booked('r1', 'R1')]);
		expect(decision).toMatchObject({ kind: 'refused', reason: 'unavailable' });
	});

	it('does nothing for a kit booked here itself', () => {
		expect(kitSwapDecision({ ...ring2, bookedHere: true }, [booked('ring1', 'R1')])).toEqual({
			kind: 'none'
		});
	});

	it('does nothing without a booked kit of the same type and org', () => {
		expect(kitSwapDecision(ring2, [{ ...booked('foh', 'F1'), templateId: 'foh' }]).kind).toBe(
			'none'
		);
		expect(
			kitSwapDecision(ring2, [{ ...booked('ring1', 'R1'), organizationId: 'other' }]).kind
		).toBe('none');
		expect(kitSwapDecision(ring2, []).kind).toBe('none');
	});

	it('leaves alone a kit whose loan is not settled yet', () => {
		expect(kitSwapDecision(ring2, [booked('ring1', 'R1', ['PENDING'])]).kind).toBe('none');
	});
});

describe('kitSwapPlan', () => {
	it('drops the replaced items and books every bookable unit of the scanned kit under it', () => {
		const plan = kitSwapPlan(
			[
				{ id: 'i1', assetId: 'a1', packedInItemId: null },
				{ id: 'i2', assetId: 'a2', packedInItemId: null }
			],
			{
				id: 'ring2',
				units: [
					{ id: 'b1', parentAssetId: null, bookable: true },
					{ id: 'b1-psu', parentAssetId: 'b1', bookable: true },
					{ id: 'b2', parentAssetId: null, bookable: false }
				]
			}
		);
		expect(plan).toEqual({
			removeItemIds: ['i1', 'i2'],
			releasedAssetIds: ['a1', 'a2'],
			create: [
				{ assetId: 'b1', sourceBundleId: 'ring2', sourceParentAssetId: null, packedInItemId: null },
				{
					assetId: 'b1-psu',
					sourceBundleId: 'ring2',
					sourceParentAssetId: 'b1',
					packedInItemId: null
				}
			]
		});
	});

	it('carries the case the replaced kit was packed into over, if all of it was in one', () => {
		const units = [{ id: 'b1', parentAssetId: null, bookable: true }];
		const one = kitSwapPlan(
			[
				{ id: 'i1', assetId: 'a1', packedInItemId: 'crate' },
				{ id: 'i2', assetId: 'a2', packedInItemId: 'crate' }
			],
			{ id: 'ring2', units }
		);
		expect(one.create[0].packedInItemId).toBe('crate');
		const split = kitSwapPlan(
			[
				{ id: 'i1', assetId: 'a1', packedInItemId: 'crate' },
				{ id: 'i2', assetId: 'a2', packedInItemId: null }
			],
			{ id: 'ring2', units }
		);
		expect(split.create[0].packedInItemId).toBeNull();
	});
});

describe('wholeKits', () => {
	it('finds the kits a selection holds whole, the outer one over its inner kits', () => {
		const kits = [
			{ id: 'foh', parentBundleId: null, unitIds: ['case', 'a1', 'a2'] },
			{ id: 'powercon', parentBundleId: 'foh', unitIds: ['a1', 'a2'] },
			{ id: 'ring', parentBundleId: null, unitIds: ['r1', 'r2'] }
		];
		expect(wholeKits(kits, new Set(['case', 'a1', 'a2', 'r1']))).toEqual(['foh']);
		expect(wholeKits(kits, new Set(['a1', 'a2', 'r1', 'r2']))).toEqual(['powercon', 'ring']);
	});
});
