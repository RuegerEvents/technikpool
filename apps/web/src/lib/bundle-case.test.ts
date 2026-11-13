import { describe, expect, it } from 'vitest';
import { bundleCaseUnit, bundleNumber, extraCases, unitMeansKit } from './bundle-case';
import { isPackCaseUnit } from './pack-cases';

const unit = (
	id: string,
	orgIndex: number,
	isContainer: boolean,
	assetTag: string | null = null
) => ({
	id,
	orgIndex,
	isContainer,
	assetTag,
	bundleId: 'wing'
});

describe('bundleCaseUnit', () => {
	it('is the container among the bundle’s units', () => {
		const units = [unit('wing', 3, false), unit('box', 7, true, 'K-12'), unit('psu', 2, false)];
		expect(bundleCaseUnit(units)?.id).toBe('box');
		expect(extraCases(units)).toBe(0);
	});
	it('takes the lowest unit number of two, and says there is another', () => {
		const units = [unit('b', 9, true), unit('a', 4, true), unit('wing', 1, false)];
		expect(bundleCaseUnit(units)?.id).toBe('a');
		expect(extraCases(units)).toBe(1);
	});
	it('is none for a bundle without a container (a DMX ring)', () => {
		expect(bundleCaseUnit([unit('a', 1, false), unit('b', 2, false)])).toBeNull();
	});
});

describe('which code means the kit', () => {
	it('is the case’s tag: a container in a bundle means the whole kit', () => {
		expect(unitMeansKit(unit('box', 7, true), 'box')).toBe(true);
	});
	it('leaves a second container a unit of its own', () => {
		expect(unitMeansKit(unit('b', 9, true), 'a')).toBe(false);
	});
	it('leaves the other units of the kit units', () => {
		expect(unitMeansKit(unit('wing', 3, false), 'box')).toBe(false);
	});
	it('makes a container in no bundle a pack case instead', () => {
		const loose = { ...unit('crate', 5, true), bundleId: null };
		expect(unitMeansKit(loose, null)).toBe(false);
		expect(isPackCaseUnit({ bundleId: null, product: { isContainer: true } })).toBe(true);
		expect(isPackCaseUnit({ bundleId: 'wing', product: { isContainer: true } })).toBe(false);
		expect(isPackCaseUnit({ bundleId: null, product: { isContainer: false } })).toBe(false);
	});
});

describe('bundleNumber — the code the label prints', () => {
	it('is the bundle’s own tag when it has one, even with a case', () => {
		expect(bundleNumber({ tag: 'FOH-1' }, { assetTag: 'K-12' })).toEqual({
			code: 'FOH-1',
			fromCase: false
		});
	});
	it('is the case’s tag without one', () => {
		expect(bundleNumber({ tag: null }, { assetTag: 'K-12' })).toEqual({
			code: 'K-12',
			fromCase: true
		});
	});
	it('is none for a bundle with neither', () => {
		expect(bundleNumber({ tag: null }, null)).toEqual({ code: null, fromCase: false });
		expect(bundleNumber({ tag: null }, { assetTag: null })).toEqual({
			code: null,
			fromCase: false
		});
	});
});
