import { describe, expect, it } from 'vitest';
import {
	bookedKitFor,
	inBookedKit,
	inKit,
	nestingRefusal,
	type NestingKit
} from './bundle-nesting';

const kit = (id: string, extra: Partial<NestingKit> = {}): NestingKit => ({
	id,
	organizationId: 'org',
	parentBundleId: null,
	childCount: 0,
	...extra
});

describe('nestingRefusal', () => {
	it('lets a plain kit go inside a plain kit', () => {
		expect(nestingRefusal(kit('foh'), kit('set'))).toBeNull();
	});

	it('lets a kit go inside one that already holds kits', () => {
		expect(nestingRefusal(kit('foh', { childCount: 2 }), kit('set'))).toBeNull();
	});

	it('refuses a kit inside itself', () => {
		expect(nestingRefusal(kit('foh'), kit('foh'))?.code).toBe('bundle_nest_self');
	});

	it('refuses a second level: into a kit that sits inside another', () => {
		expect(nestingRefusal(kit('set', { parentBundleId: 'foh' }), kit('other'))?.code).toBe(
			'bundle_nest_outer_nested'
		);
	});

	it('refuses a second level: a kit that holds kits of its own', () => {
		expect(nestingRefusal(kit('truck'), kit('foh', { childCount: 1 }))?.code).toBe(
			'bundle_nest_inner_has_kits'
		);
	});

	it('refuses a kit of another organization', () => {
		expect(nestingRefusal(kit('foh'), kit('set', { organizationId: 'other' }))?.code).toBe(
			'bundle_nest_org_mismatch'
		);
	});

	it('leaves moving out of a third kit to the caller', () => {
		expect(nestingRefusal(kit('foh'), kit('set', { parentBundleId: 'rack' }))).toBeNull();
	});
});

describe('booked kits', () => {
	const inner = { bundleId: 'set', bundle: { parentBundleId: 'foh' } };
	const own = { bundleId: 'foh', bundle: { parentBundleId: null } };

	it('counts a unit of the inner kit as in the outer one', () => {
		expect(inKit(inner, 'foh')).toBe(true);
		expect(inKit(inner, 'set')).toBe(true);
		expect(inKit(own, 'set')).toBe(false);
	});

	it('reads a unit booked through the outer kit as still in it', () => {
		expect(inBookedKit({ sourceBundleId: 'foh', asset: inner })).toBe(true);
		expect(inBookedKit({ sourceBundleId: 'set', asset: inner })).toBe(true);
		expect(inBookedKit({ sourceBundleId: 'foh', asset: { bundleId: null } })).toBe(false);
		expect(inBookedKit({ sourceBundleId: null, asset: inner })).toBe(false);
	});

	it('joins the outer kit’s booking first, else the inner kit’s', () => {
		expect(bookedKitFor(inner, new Set(['foh', 'set']))).toBe('foh');
		expect(bookedKitFor(inner, new Set(['set']))).toBe('set');
		expect(bookedKitFor(inner, new Set())).toBeNull();
		expect(bookedKitFor(own, new Set(['foh']))).toBe('foh');
	});
});
