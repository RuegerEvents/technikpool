import { describe, expect, it } from 'vitest';
import { bandColor, cableBandFor } from './cable-colors.ts';

const band = (maxLengthCm: number, paletteKey: string | null = 'red') => ({
	maxLengthCm,
	paletteKey,
	customName: paletteKey ? null : 'neongelb',
	customHex: paletteKey ? null : '#ccff00'
});

describe('cableBandFor', () => {
	const bands = [band(500, 'green'), band(100, 'red'), band(300, 'blue')];

	it('takes the shortest band that reaches the length, bounds included', () => {
		expect(cableBandFor(50, bands)?.paletteKey).toBe('red');
		expect(cableBandFor(100, bands)?.paletteKey).toBe('red');
		expect(cableBandFor(101, bands)?.paletteKey).toBe('blue');
		expect(cableBandFor(250, bands)?.paletteKey).toBe('blue');
		expect(cableBandFor(500, bands)?.paletteKey).toBe('green');
	});

	it('gives nothing past the last band or without a length', () => {
		expect(cableBandFor(501, bands)).toBeNull();
		expect(cableBandFor(null, bands)).toBeNull();
		expect(cableBandFor(0, bands)).toBeNull();
		expect(cableBandFor(100, [])).toBeNull();
	});
});

describe('bandColor', () => {
	it('names a palette colour in German and keeps an own colour as given', () => {
		expect(bandColor(band(100, 'white'))).toEqual({ hex: '#ffffff', nameDe: 'weiß' });
		expect(bandColor(band(100, null))).toEqual({ hex: '#ccff00', nameDe: 'neongelb' });
		expect(bandColor(band(100, 'magenta'))).toBeNull();
	});
});
