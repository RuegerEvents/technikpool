import { describe, expect, it } from 'vitest';
import { matchesSearch, normalizeSearch } from './search.ts';

describe('normalizeSearch', () => {
	it('treats separators as spaces and writes numbers one way', () => {
		expect(normalizeSearch('Schuko M → TRUE1 F')).toBe('schuko m true 1 f');
		expect(normalizeSearch('Schuko 10 m')).toBe('schuko 10m');
		expect(normalizeSearch('USB-C 0,5 m')).toBe('usb c 0.5m');
		expect(normalizeSearch('XLR3 M → XLR3 F 5m')).toBe('xlr 3 m xlr 3 f 5m');
		expect(normalizeSearch('Größe (Ü)')).toBe('grosse u');
	});
});

describe('matchesSearch', () => {
	const cable = ['TR1 Schuko-Zuleitung', 'Schuko M', 'TRUE1 F'];

	it('finds a cable by what comes after the arrow', () => {
		expect(matchesSearch('true1', ...cable)).toBe(true);
		expect(matchesSearch('true1 schuko', ...cable)).toBe(true);
	});

	it('ignores word order and how a length is written', () => {
		expect(matchesSearch('10 m schuko', 'Schuko 10m')).toBe(true);
		expect(matchesSearch('0.5m usb-c', 'USB-C auf C 0,5 m')).toBe(true);
	});

	it('forgives a typo in a longer word, not in a short one', () => {
		expect(matchesSearch('powrcon', 'powerCON grau F')).toBe(true);
		expect(matchesSearch('schucko', 'Schuko 10 m')).toBe(true);
		expect(matchesSearch('xlt', 'XLR Kabel 5m')).toBe(false);
	});

	it('counts a half-typed word', () => {
		expect(matchesSearch('powerc', 'powerCON grau F')).toBe(true);
	});

	it('lets words in between be left out', () => {
		expect(matchesSearch('unifi 0.3', 'UniFi Patch Kabel flexibel 0,3 m')).toBe(true);
		expect(matchesSearch('c auf c 0.5m', 'USB-C auf C 0,5 m')).toBe(true);
	});

	it('writes a length one way, and a number means that number', () => {
		expect(matchesSearch('1m', 'USB-C 1 m')).toBe(true);
		expect(matchesSearch('1 m', 'USB-C 1m')).toBe(true);
		expect(matchesSearch('0.5m', 'USB-C 0,5 m')).toBe(true);
		expect(matchesSearch('0,5 m', 'USB-C 0.5m')).toBe(true);
		expect(matchesSearch('1m', 'Schuko 10 m')).toBe(false);
		expect(matchesSearch('0.5', 'XLR 0,55 m')).toBe(false);
	});

	it('keeps a unit on its number', () => {
		expect(matchesSearch('2m', 'SanDisk Extreme PRO mit USB4 2TB')).toBe(false);
		expect(matchesSearch('2m', 'XLR Kabel 2 m')).toBe(true);
		expect(matchesSearch('10', 'Schuko 10 m')).toBe(true);
		expect(matchesSearch('3m', 'XLR3 M → XLR3 F 5m')).toBe(false);
		expect(matchesSearch('xlr3 m', 'XLR3 M')).toBe(true);
	});

	it('lets the digits of a name be half-typed', () => {
		expect(matchesSearch('ip6', 'WP Safe Box 3 IP65')).toBe(true);
		expect(matchesSearch('ip65', 'WP Safe Box 3 IP65')).toBe(true);
		expect(matchesSearch('ip66', 'WP Safe Box 3 IP65')).toBe(false);
		expect(matchesSearch('usb4', 'Extreme PRO mit USB4 2TB')).toBe(true);
	});

	it('keeps the digits of a name with its letters', () => {
		const mac = ['Mac Mini M1 8GB', 'Apple', 'Rüger Events - Software und Veranstaltungstechnik'];
		expect(matchesSearch('tr1', ...mac)).toBe(false);
		expect(matchesSearch('tr1', 'TR1 Schuko-Zuleitung')).toBe(true);
		expect(matchesSearch('tr1', 'Schuko M', 'TRUE1 F')).toBe(true);
		expect(matchesSearch('m1', ...mac)).toBe(true);
	});

	it('reads a run of words in order', () => {
		expect(matchesSearch('cee 32', 'CEE32 20 m')).toBe(true);
		expect(matchesSearch('usb-c', 'Extreme PRO mit USB4 Hülle', 'Case')).toBe(false);
		expect(matchesSearch('usb c', 'USB-C Kabel')).toBe(true);
		expect(matchesSearch('1m', 'ATEM 1 M/E Production Studio 4K')).toBe(false);
		expect(matchesSearch('mac m1', 'Mac Mini M1 8GB')).toBe(true);
		expect(matchesSearch('z300', 'Auro Spot Z 300')).toBe(true);
		expect(matchesSearch('m1', 'Pro Max 16 PoE')).toBe(false);
		expect(matchesSearch('50', 'RUTX50')).toBe(false);
		expect(matchesSearch('rutx 50', 'RUTX50')).toBe(true);
		expect(matchesSearch('2u', 'Scarlett 2i2')).toBe(false);
		expect(matchesSearch('2u', 'UniFi UPS 2U')).toBe(true);
		expect(matchesSearch('auro', 'Eurobox 60x40')).toBe(false);
	});

	it('finds a tag as it is typed', () => {
		expect(matchesSearch('4000012', 'Titan Tube', '40000121')).toBe(true);
	});

	it('finds an inventory number exactly, never one a digit or two off', () => {
		expect(matchesSearch('40000115', 'Titan Tube', '40000115')).toBe(true);
		expect(matchesSearch('40000115', 'Titan Tube', '40000116')).toBe(false);
		expect(matchesSearch('40000115', 'Titan Tube', '40000105')).toBe(false);
		expect(matchesSearch('40000115', 'Titan Tube', '40000215')).toBe(false);
		expect(matchesSearch('4000011', 'Titan Tube', '40000125')).toBe(false);
		expect(matchesSearch('0115', 'Titan Tube', '40000115')).toBe(true);
	});

	it('finds an inventory number by its last digits', () => {
		expect(matchesSearch('115', 'Titan Tube', '40000115')).toBe(true);
		expect(matchesSearch('15', 'Titan Tube', '40000115')).toBe(true);
		expect(matchesSearch('115', 'Titan Tube', '40001150')).toBe(false);
		// A short number is still a length on a name, not part of one.
		expect(matchesSearch('10', 'Schuko 10 m', '40000999')).toBe(true);
		expect(matchesSearch('1m', 'Schuko 10 m', '40000001')).toBe(false);
	});

	it('needs every word', () => {
		expect(matchesSearch('schuko xlr', 'Schuko 10 m')).toBe(false);
	});

	it('matches everything when empty', () => {
		expect(matchesSearch('  ', 'anything')).toBe(true);
	});
});
