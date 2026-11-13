import { describe, expect, it } from 'vitest';
import {
	casePaths,
	caseTitle,
	compareCases,
	packRefusal,
	pickToPack,
	sectionCaseOf,
	withinCase,
	type ListCase,
	type PackNode
} from './pack-cases';
import { listSections, type ListGroup, type ListLine } from './production-list';

function node(itemId: string, packedInItemId: string | null, isPackCase = false): PackNode {
	return {
		itemId,
		packedInItemId,
		isPackCase,
		ref: { assetId: `a-${itemId}`, name: 'Transflex 60×40', tag: itemId.toUpperCase(), orgIndex: 1 }
	};
}

describe('casePaths', () => {
	it('gives each case the cases around it, outermost first', () => {
		const cases = casePaths([
			node('k1', null, true),
			node('k2', 'k1', true),
			node('k3', 'k2', true),
			node('cable', 'k3')
		]);
		expect(cases.get('k1')?.path).toEqual([]);
		expect(cases.get('k3')?.path.map((r) => r.tag)).toEqual(['K1', 'K2']);
		expect(cases.has('cable')).toBe(false);
	});

	it('counts a link to something that is no case as none', () => {
		const cases = casePaths([node('box', 'mixer', true), node('mixer', null)]);
		expect(cases.get('box')?.path).toEqual([]);
	});

	it('stops where a stored circle would close', () => {
		const cases = casePaths([node('k1', 'k2', true), node('k2', 'k1', true)]);
		expect(cases.get('k1')?.path.map((r) => r.tag)).toEqual(['K2']);
	});
});

describe('sectionCaseOf', () => {
	const nodes = [
		node('k1', null, true),
		node('k2', 'k1', true),
		node('mic', 'k2'),
		node('di', null)
	];
	const cases = casePaths(nodes);
	it('lists a case under itself and a unit under its case', () => {
		expect(sectionCaseOf(nodes[1], cases)?.assetId).toBe('a-k2');
		expect(sectionCaseOf(nodes[2], cases)?.assetId).toBe('a-k2');
		expect(sectionCaseOf(nodes[3], cases)).toBeNull();
	});
	it('knows what is somewhere inside a case', () => {
		expect(withinCase(sectionCaseOf(nodes[2], cases), 'a-k1')).toBe(true);
		expect(withinCase(sectionCaseOf(nodes[2], cases), 'a-di')).toBe(false);
	});
});

describe('packRefusal', () => {
	const outer = new Map<string, string | null>([
		['k1', null],
		['k2', 'k1'],
		['k3', 'k2']
	]);
	const outerOf = (id: string) => outer.get(id) ?? null;

	it('lets anything go into a case', () => {
		expect(packRefusal(['mic'], { itemId: 'k3', isPackCase: true }, outerOf)).toBeNull();
		expect(packRefusal(['k4'], { itemId: 'k1', isPackCase: true }, outerOf)).toBeNull();
	});
	it('refuses what is no case', () => {
		expect(packRefusal(['mic'], { itemId: 'mixer', isPackCase: false }, outerOf)).toBe(
			'not_a_case'
		);
	});
	it('refuses a case into itself', () => {
		expect(packRefusal(['k2'], { itemId: 'k2', isPackCase: true }, outerOf)).toBe('into_itself');
	});
	it('refuses a case into something it holds, however deep', () => {
		expect(packRefusal(['k1'], { itemId: 'k3', isPackCase: true }, outerOf)).toBe('circle');
		expect(packRefusal(['mic', 'k2'], { itemId: 'k3', isPackCase: true }, outerOf)).toBe('circle');
	});
	it('lets a case move up out of the one around it', () => {
		expect(packRefusal(['k3'], { itemId: 'k1', isPackCase: true }, outerOf)).toBeNull();
	});
});

describe('pickToPack', () => {
	const ids = ['c1', 'c2', 'c3', 'c4', 'c5'];
	it('takes the units already out first, then the rest, in line order', () => {
		const out = new Set(['c4', 'c2']);
		expect(pickToPack(ids, 3, (id) => out.has(id))).toEqual(['c2', 'c4', 'c1']);
	});
	it('is clamped to the line', () => {
		expect(pickToPack(ids, 9, () => false)).toEqual(ids);
		expect(pickToPack(ids, -2, () => false)).toEqual([]);
	});
});

describe('compareCases', () => {
	const ref = (tag: string) => ({ assetId: tag, name: 'Transflex', tag, orgIndex: 0 });
	const c = (tag: string, ...path: string[]): ListCase => ({ ...ref(tag), path: path.map(ref) });
	it('puts a case inside another right after it', () => {
		const sorted = [c('10'), c('5', '3'), c('3'), c('4', '3')].sort(compareCases);
		expect(sorted.map((x) => x.tag)).toEqual(['3', '4', '5', '10']);
		expect(sorted.map((x) => x.path.length)).toEqual([0, 1, 1, 0]);
	});
	it('names a case without a tag by its number', () => {
		expect(caseTitle({ assetId: 'x', name: 'Transflex 60×40', tag: null, orgIndex: 12 })).toBe(
			'#12 (Transflex 60×40)'
		);
	});
});

describe('listSections with pack cases', () => {
	const shelf: ListGroup = { kind: 'location', name: 'Regal A' };
	const ref = (tag: string) => ({ assetId: tag, name: 'Transflex', tag, orgIndex: 0 });
	const k1: ListCase = { ...ref('K1'), path: [] };
	const k2: ListCase = { ...ref('K2'), path: [ref('K1')] };
	const unit = (assetId: string, productName: string, packCase: ListCase | null = null) => ({
		assetId,
		accessoryOf: null,
		productName,
		group: shelf,
		kit: null,
		packCase
	});
	const line = (key: string, assetIds: string[], packCase: ListCase | null): ListLine => ({
		key,
		productName: 'XLR 10m',
		productCaption: null,
		productImagePath: null,
		manufacturerName: null,
		lentBy: null,
		group: shelf,
		assetIds,
		total: assetIds.length,
		done: 0,
		floor: 0,
		packCase
	});

	it('lists cases first, nested, each headed by its own row, then what is loose', () => {
		const sections = listSections(
			[
				unit('mixer', 'Mixer'),
				unit('mic', 'Mic', k1),
				unit('K1', 'Transflex', k1),
				unit('K2', 'Transflex', k2),
				unit('di', 'DI', k2),
				unit('x1', 'XLR 10m'),
				unit('x2', 'XLR 10m'),
				unit('x3', 'XLR 10m', k2)
			],
			[line('l-loose', ['x1', 'x2'], null), line('l-k2', ['x3'], k2)]
		);
		expect(sections.map((s) => [s.key, s.depth])).toEqual([
			['case:K1', 0],
			['case:K2', 1],
			['location:Regal A', 0]
		]);
		const ids = (i: number) =>
			sections[i].rows.map((r) =>
				r.kind === 'unit' ? r.unit.assetId : r.kind === 'line' ? r.line.key : 'kit'
			);
		expect(ids(0)).toEqual(['K1', 'mic']);
		expect(ids(1)).toEqual(['K2', 'di', 'l-k2']);
		expect(ids(2)).toEqual(['mixer', 'l-loose']);
	});

	it('shows the case around a case even when nothing of it is on this list', () => {
		const sections = listSections([unit('di', 'DI', k2)], []);
		expect(sections.map((s) => [s.key, s.depth, s.rows.length])).toEqual([
			['case:K1', 0, 0],
			['case:K2', 1, 1]
		]);
	});

	it('leaves a list without cases as it was', () => {
		const sections = listSections([unit('mixer', 'Mixer'), unit('x1', 'XLR 10m')], []);
		expect(sections.map((s) => [s.key, s.packCase])).toEqual([['location:Regal A', null]]);
	});
});
