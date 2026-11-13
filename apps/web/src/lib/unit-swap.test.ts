import { describe, expect, it } from 'vitest';
import {
	bookedWithPlace,
	bookingClash,
	seeksSwap,
	swapBookingClash,
	swapPlacements,
	swapRefusal,
	type PlacedBooking,
	type SwapUnit
} from './unit-swap';

const unit = (id: string, extra: Partial<SwapUnit> = {}): SwapUnit => ({
	id,
	productId: 'adapter-5-3',
	organizationId: 'org',
	bundleId: null,
	parentAssetId: null,
	locationId: 'shelf',
	status: 'AVAILABLE',
	accessoryCount: 0,
	...extra
});

const free = { notInterchangeable: false, scannedOut: false, partnerOut: false };

describe('swapRefusal', () => {
	const ring1 = unit('a1', { bundleId: 'ring1', locationId: 'case-shelf' });

	it('lets a unit of another kit take the place', () => {
		expect(swapRefusal(unit('a2', { bundleId: 'ring2' }), ring1, free)).toBeNull();
	});

	it('lets a loose unit take the place', () => {
		expect(swapRefusal(unit('a9'), ring1, free)).toBeNull();
	});

	it('lets a power supply on another node take the place', () => {
		const psuA = unit('psuA', { productId: 'psu', parentAssetId: 'nodeA' });
		const psuB = unit('psuB', { productId: 'psu', parentAssetId: 'nodeB' });
		expect(swapRefusal(psuB, psuA, free)).toBeNull();
	});

	it('refuses another product or another org', () => {
		expect(swapRefusal(unit('x', { productId: 'other' }), ring1, free)).toBe('other_product');
		expect(swapRefusal(unit('x', { organizationId: 'org2' }), ring1, free)).toBe('other_org');
	});

	it('refuses a product marked not interchangeable', () => {
		expect(swapRefusal(unit('x'), ring1, { ...free, notInterchangeable: true })).toBe(
			'not_interchangeable'
		);
	});

	it('leaves a loose partner to the stand-in rule', () => {
		expect(swapRefusal(unit('x', { bundleId: 'ring2' }), unit('y'), free)).toBe(
			'partner_not_linked'
		);
	});

	it('does nothing for a unit already in the same place', () => {
		expect(swapRefusal(unit('a3', { bundleId: 'ring1' }), ring1, free)).toBe('same_place');
	});

	it('refuses a unit that is broken, in maintenance or unavailable', () => {
		for (const status of ['BROKEN', 'MAINTENANCE', 'UNAVAILABLE']) {
			expect(swapRefusal(unit('x', { status }), ring1, free)).toBe('unavailable');
		}
	});

	it('refuses a unit that is out, and a partner that is', () => {
		expect(swapRefusal(unit('x'), ring1, { ...free, scannedOut: true })).toBe('out');
		expect(swapRefusal(unit('x'), ring1, { ...free, partnerOut: true })).toBe('partner_out');
	});

	it('keeps accessories one level deep', () => {
		const psuA = unit('psuA', { parentAssetId: 'nodeA' });
		// A unit with accessories of its own never becomes one.
		expect(swapRefusal(unit('x', { accessoryCount: 1 }), psuA, free)).toBe('nested');
		// Nor does the partner, sent to an accessory's place.
		expect(
			swapRefusal(
				unit('x', { parentAssetId: 'nodeB' }),
				unit('y', { bundleId: 'k', accessoryCount: 2 }),
				free
			)
		).toBe('nested');
		// And nothing takes its own parent's place.
		expect(swapRefusal(unit('nodeA'), psuA, free)).toBe('nested');
	});

	it('is the same unit', () => {
		expect(swapRefusal(ring1, ring1, free)).toBe('same_unit');
	});
});

describe('swapPlacements', () => {
	it('swaps two kits', () => {
		const a1 = unit('a1', { bundleId: 'ring1', locationId: 'l1' });
		const a2 = unit('a2', { bundleId: 'ring2', locationId: 'l2' });
		expect(swapPlacements(a2, a1)).toEqual({
			scanned: { bundleId: 'ring1', parentAssetId: null, locationId: 'l1' },
			partner: { bundleId: 'ring2', parentAssetId: null, locationId: 'l2' }
		});
	});

	it('swaps two accessories, with the kit their parents are in', () => {
		const psuA = unit('psuA', { parentAssetId: 'nodeA', bundleId: 'rack', locationId: 'l1' });
		const psuB = unit('psuB', { parentAssetId: 'nodeB', locationId: 'l2' });
		expect(swapPlacements(psuB, psuA)).toEqual({
			scanned: { bundleId: 'rack', parentAssetId: 'nodeA', locationId: 'l1' },
			partner: { bundleId: null, parentAssetId: 'nodeB', locationId: 'l2' }
		});
	});

	it('leaves the partner loose on its own shelf when the scanned one was loose', () => {
		const a1 = unit('a1', { bundleId: 'ring1', locationId: 'l1' });
		const loose = unit('a9', { locationId: 'l9' });
		expect(swapPlacements(loose, a1).partner).toEqual({
			bundleId: null,
			parentAssetId: null,
			locationId: 'l1'
		});
	});
});

describe('bookedWithPlace', () => {
	it('is the kit the unit is still in', () => {
		expect(
			bookedWithPlace(
				{ sourceBundleId: 'ring1', sourceParentAssetId: null },
				{ bundleId: 'ring1', parentAssetId: null }
			)
		).toBe(true);
	});

	it('is the outer kit of the inner kit the unit is in', () => {
		expect(
			bookedWithPlace(
				{ sourceBundleId: 'foh', sourceParentAssetId: null },
				{ bundleId: 'powercon-set', parentAssetId: null, bundle: { parentBundleId: 'foh' } }
			)
		).toBe(true);
	});

	it('is the unit it still hangs off', () => {
		expect(
			bookedWithPlace(
				{ sourceBundleId: null, sourceParentAssetId: 'nodeA' },
				{ bundleId: null, parentAssetId: 'nodeA' }
			)
		).toBe(true);
	});

	it('is not a loose booking, nor a kit the unit has left', () => {
		const inRing2 = { bundleId: 'ring2', parentAssetId: null };
		expect(bookedWithPlace({ sourceBundleId: null, sourceParentAssetId: null }, inRing2)).toBe(
			false
		);
		expect(bookedWithPlace({ sourceBundleId: 'ring1', sourceParentAssetId: null }, inRing2)).toBe(
			false
		);
	});
});

describe('seeksSwap', () => {
	const none = { bookedKits: new Set<string>(), bookedUnits: new Set<string>(), goingOut: [] };

	it('looks for a place for a unit whose own kit is not booked', () => {
		expect(seeksSwap({ bundleId: 'ring2', parentAssetId: null }, none)).toBe(true);
	});

	it('joins its own kit when that is booked, the outer one too', () => {
		const booked = { ...none, bookedKits: new Set(['foh']) };
		expect(seeksSwap({ bundleId: 'foh', parentAssetId: null }, booked)).toBe(false);
		expect(
			seeksSwap({ bundleId: 'set', parentAssetId: null, bundle: { parentBundleId: 'foh' } }, booked)
		).toBe(false);
	});

	it('leaves an accessory with its parent when that is booked or going out', () => {
		const psu = { bundleId: null, parentAssetId: 'nodeB' };
		expect(seeksSwap(psu, { ...none, bookedUnits: new Set(['nodeB']) })).toBe(false);
		expect(seeksSwap(psu, { ...none, goingOut: ['nodeB'] })).toBe(false);
		expect(seeksSwap(psu, none)).toBe(true);
	});
});

describe('booking clashes', () => {
	const day = (d: number) => new Date(Date.UTC(2026, 10, d));
	const booking = (
		productionId: string,
		from: number | null,
		to: number | null
	): PlacedBooking => ({
		productionId,
		startDate: from === null ? null : day(from),
		endDate: to === null ? null : day(to),
		sourceBundleId: null,
		sourceParentAssetId: null
	});

	it('clashes on overlapping dates and on the same production', () => {
		expect(bookingClash([booking('p1', 1, 5)], [booking('p2', 5, 9)])).toBe(true);
		expect(bookingClash([booking('p1', 1, 4)], [booking('p2', 5, 9)])).toBe(false);
		expect(bookingClash([booking('p1', null, null)], [booking('p1', 5, 9)])).toBe(true);
		expect(bookingClash([booking('p1', null, null)], [booking('p2', 5, 9)])).toBe(false);
	});

	it('moves place-bound bookings with the place and keeps the rest', () => {
		const scanned = {
			unit: { bundleId: 'ring2', parentAssetId: null },
			bookings: [] as PlacedBooking[]
		};
		// The partner's ring-1 booking on p1 comes over to the scanned unit…
		const ringBooking = { ...booking('p1', 10, 12), sourceBundleId: 'ring1' };
		const partner = { unit: { bundleId: 'ring1', parentAssetId: null }, bookings: [ringBooking] };
		expect(swapBookingClash(scanned, partner)).toBe(false);
		// …which clashes with a loose booking the scanned unit keeps.
		expect(swapBookingClash({ ...scanned, bookings: [booking('p2', 11, 13)] }, partner)).toBe(true);
		// Its own ring-2 booking on overlapping dates goes to the partner instead.
		const ring2Booking = { ...booking('p3', 11, 13), sourceBundleId: 'ring2' };
		expect(swapBookingClash({ ...scanned, bookings: [ring2Booking] }, partner)).toBe(false);
	});
});
