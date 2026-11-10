import { describe, expect, it } from 'vitest';
import {
	caseLabelLines,
	dataMatrixModules,
	fitTitle,
	labelaryViewerUrl,
	renderCaseLabel,
	wrap,
	type CaseLabelData
} from './case-label-zpl';

const kit: CaseLabelData = {
	title: 'Mikrofonkoffer Gesang',
	caption: 'Funkstrecken für die Bühne',
	code: 'K-03',
	orgName: 'Rüger Events',
	lines: [
		{ count: 4, name: 'Shure SM58', accessory: false, each: null },
		{ count: 4, name: 'Mikrofonklemme', accessory: true, each: 1 },
		{ count: 2, name: 'XLR-Kabel 10m', accessory: false, each: null }
	]
};

describe('renderCaseLabel', () => {
	it('is one UTF-8 label sized for the roll', () => {
		const zpl = renderCaseLabel(kit, 'large', null).zpl;
		expect(zpl.startsWith('^XA\n^CI28\n^PW813\n^LL1219')).toBe(true);
		expect(zpl.endsWith('^XZ')).toBe(true);
		expect(zpl.match(/\^XA/g)).toHaveLength(1);
	});

	it('carries the tag as a DataMatrix and lists the contents', () => {
		const zpl = renderCaseLabel(kit, 'large', null).zpl;
		expect(zpl).toMatch(/\^BXN,\d+,200\^FH\^FDK-03\^FS/);
		expect(zpl).toContain('^FDShure SM58^FS');
		expect(zpl).toContain('^FD4×^FS');
		expect(zpl).toContain('^FDRüger Events^FS');
	});

	it('marks accessories per unit and in total', () => {
		const zpl = renderCaseLabel(kit, 'large', null).zpl;
		expect(zpl).toContain('^FDje 1×^FS');
		expect(zpl).toContain('^FDinsg. 4×^FS');
	});

	it('puts the code and the owner in the footer', () => {
		const zpl = renderCaseLabel(kit, 'small', null).zpl;
		const matrix = zpl.indexOf('^BX');
		const title = zpl.search(/\^FB\d+,1,0,C\^FH\^FDMikrofonkoffer/);
		expect(title).toBeGreaterThan(-1);
		expect(matrix).toBeGreaterThan(title);
		expect(zpl).toContain('^FDRüger Events^FS');
		expect(zpl).not.toContain('Inhalt');
	});

	it('escapes what ZPL would read as a command', () => {
		const zpl = renderCaseLabel({ ...kit, title: 'A^B~C_D' }, 'large', null).zpl;
		expect(zpl).toContain('^FDA_5EB_7EC_5FD^FS');
	});

	it('continues a long list on further labels, without the title', () => {
		const lines = Array.from({ length: 40 }, (_, i) => ({
			count: 1,
			name: `Teil ${i}`,
			accessory: false,
			each: null
		}));
		const { zpl, labels } = renderCaseLabel({ ...kit, lines }, 'large', null);
		expect(labels).toBeGreaterThan(1);
		const pages = zpl.split('^XZ').filter((p) => p.trim());
		expect(pages).toHaveLength(labels);
		expect(pages[0]).toContain('^FDMikrofonkoffer');
		expect(pages[0]).not.toContain('^BX');
		expect(pages.at(-1)).not.toContain('^FDMikrofonkoffer');
		expect(pages.at(-1)).toContain('^BX');
		expect(zpl).toContain('^FDTeil 39^FS');
		expect(zpl).toContain(`^FD1/${labels}^FS`);
	});

	it('keeps a unit and its accessories on one label', () => {
		const filler = Array.from({ length: 16 }, (_, i) => ({
			count: 1,
			name: `Teil ${i}`,
			accessory: false,
			each: null
		}));
		const block = [
			{ count: 2, name: 'Nebelmaschine', accessory: false, each: null },
			{ count: 2, name: 'Fernbedienung', accessory: true, each: 1 },
			{ count: 2, name: 'Kaltgerätekabel', accessory: true, each: 1 }
		];
		const { zpl } = renderCaseLabel({ ...kit, lines: [...filler, ...block] }, 'large', null);
		const page = zpl.split('^XZ').find((p) => p.includes('^FDNebelmaschine^FS'))!;
		expect(page).toContain('^FDKaltgerätekabel^FS');
	});

	it('wraps a long name rather than cutting it', () => {
		const name = 'Stairville VF-1200 Fernbedienung mit Kabel und Halter';
		const { zpl } = renderCaseLabel(
			{ ...kit, lines: [{ count: 4, name, accessory: true, each: 1 }] },
			'large',
			null
		);
		expect(zpl).not.toContain('…');
		expect(zpl).toContain('^FDStairville VF-1200 Fernbedienung');
	});

	it('turns the tag upright beside the code', () => {
		expect(renderCaseLabel(kit, 'large', null).zpl).toMatch(
			/\^A0B,\d+,\d+\^FB160,1,0,C\^FH\^FDK-03\^FS/
		);
	});

	it('prints without a code when the case has no tag', () => {
		const zpl = renderCaseLabel({ ...kit, code: null }, 'small', null).zpl;
		expect(zpl).not.toContain('^BX');
		expect(zpl).toContain('^PW640');
		expect(zpl).toContain('^LL440');
	});

	it('embeds the logo as a graphic field', () => {
		const logo = { width: 16, height: 2, bytes: new Uint8Array([0xff, 0x00, 0x0f, 0xf0]) };
		const zpl = renderCaseLabel(kit, 'large', logo).zpl;
		expect(zpl).toContain('^GFA,4,4,2,FF000FF0^FS');
		expect(zpl).not.toContain('^FDRüger Events^FS');
	});
});

describe('wrap', () => {
	it('breaks at words and cuts the last line short', () => {
		const lines = wrap('eins zwei drei vier fünf sechs sieben acht', 40, 250, 2);
		expect(lines).toHaveLength(2);
		expect(lines[1].endsWith('…')).toBe(true);
	});
});

describe('fitTitle', () => {
	it('breaks two lines evenly rather than leaving one word behind', () => {
		const { lines, size } = fitTitle(
			'4x Stairville Vertifog Kit',
			749,
			270,
			[128, 112, 100, 88],
			88
		);
		expect(lines).toEqual(['4x Stairville', 'Vertifog Kit']);
		expect(size).toBeGreaterThanOrEqual(100);
	});

	it('goes smaller before cutting a word', () => {
		const { lines } = fitTitle('Kaltgerätekabelverlängerungsset', 749, 230, [120, 96, 72, 48], 72);
		expect(lines).toEqual(['Kaltgerätekabelverlängerungsset']);
	});
});

describe('caseLabelLines', () => {
	const unit = (id: string, name: string, accessoryOf: string | null = null) => ({
		assetId: id,
		name,
		accessoryOf
	});

	it('counts accessories per unit when every unit carries the same', () => {
		const lines = caseLabelLines([
			unit('a', 'VF-1200'),
			unit('a1', 'Kaltgerätekabel', 'a'),
			unit('b', 'VF-1200'),
			unit('b1', 'Kaltgerätekabel', 'b'),
			unit('c', 'Fluid')
		]);
		expect(lines).toEqual([
			{ count: 2, name: 'VF-1200', accessory: false, each: null },
			{ count: 2, name: 'Kaltgerätekabel', accessory: true, each: 1 },
			{ count: 1, name: 'Fluid', accessory: false, each: null }
		]);
	});

	it('gives only the total where the units differ, or there is one', () => {
		const lines = caseLabelLines([
			unit('a', 'Par'),
			unit('a1', 'Bracket', 'a'),
			unit('a2', 'Bracket', 'a'),
			unit('b', 'Par'),
			unit('b1', 'Bracket', 'b'),
			unit('c', 'Bar'),
			unit('c1', 'Netzteil', 'c'),
			unit('c2', 'Netzteil', 'c')
		]);
		expect(lines[1]).toEqual({ count: 3, name: 'Bracket', accessory: true, each: null });
		expect(lines[3]).toEqual({ count: 2, name: 'Netzteil', accessory: true, each: null });
	});
});

describe('dataMatrixModules', () => {
	it('picks the smallest ECC 200 square that holds the code', () => {
		// Digit pairs share a codeword: eight digits are four, one more than 10×10 holds.
		expect(dataMatrixModules('40000001')).toBe(12);
		expect(dataMatrixModules('K-03')).toBe(10);
		// Two UTF-8 bytes past ASCII, two codewords each.
		expect(dataMatrixModules('Ä')).toBe(12);
	});
});

describe('labelaryViewerUrl', () => {
	it('opens the viewer at the label size with the ZPL filled in', () => {
		const url = new URL(labelaryViewerUrl('^XA^XZ', 'small'));
		expect(url.origin).toBe('https://labelary.com');
		expect(url.searchParams.get('zpl')).toBe('^XA^XZ');
		expect(url.searchParams.get('width')).toBe('80');
		expect(url.searchParams.get('units')).toBe('mm');
		expect(url.searchParams.get('density')).toBe('8');
	});
});
