import { describe, expect, it } from 'vitest';
import {
	groupBillingItems,
	lineSubtitle,
	printedSections,
	type GroupableItem
} from './billing-lines';

let next = 0;
function unit(category: string, product: string, lineTotal: number): GroupableItem {
	next++;
	return {
		id: `item-${next}`,
		categoryId: `cat-${category}`,
		categoryName: category,
		categoryColor: null,
		productId: `prod-${product}`,
		productLabel: product,
		description: `#${next}`,
		netPurchasePrice: 10,
		ratePercent: 1,
		dailyRate: lineTotal,
		lineTotal
	};
}

const name = (item: GroupableItem) => item.categoryName ?? '';

const items = [
	unit('Licht', 'Par', 3.3),
	unit('Licht', 'DMX 2 m', 0.08),
	unit('Licht', 'DMX 2 m', 0.08),
	unit('Strom', 'Schuko 10 m', 0.38),
	unit('Strom', 'Schuko 5 m', 0.24),
	unit('Case', 'Auer ED', 0)
];

describe('groupBillingItems with a layout', () => {
	it('leaves the lines alone without one', () => {
		const sections = groupBillingItems(items, name);
		expect(sections.map((s) => [s.name, s.lines.length])).toEqual([
			['Case', 1],
			['Licht', 2],
			['Strom', 2]
		]);
		expect(sections.flatMap((s) => s.lines).some((l) => l.hidden)).toBe(false);
	});

	it('hides 0,00 € lines from the printout, and drops a section left empty', () => {
		const sections = groupBillingItems(items, name, { hideZeroLines: true });
		expect(sections[0].lines[0]).toMatchObject({ label: 'Auer ED', hidden: true });
		expect(printedSections(sections).map((s) => s.name)).toEqual(['Licht', 'Strom']);
	});

	it('folds a collective line across sections into its first member’s place', () => {
		const sections = groupBillingItems(items, name, {
			lineGroups: [
				{
					id: 'g1',
					label: 'Kabel',
					keys: ['product:prod-DMX 2 m', 'product:prod-Schuko 10 m', 'product:prod-Schuko 5 m']
				}
			]
		});
		// Strom held nothing else, so it goes; Licht's subtotal now carries the cables.
		expect(sections.map((s) => [s.name, s.lines.map((l) => l.label), s.subtotal])).toEqual([
			['Case', ['Auer ED'], 0],
			['Licht', ['Kabel', 'Par'], 4.08]
		]);
		const kabel = sections[1].lines[0];
		expect(kabel.lineTotal).toBe(0.78);
		expect(kabel.items).toHaveLength(4);
		expect(lineSubtitle(kabel)).toBe('2× DMX 2 m, Schuko 5 m, Schuko 10 m');
	});

	it('keeps a key in the first group that names it, and ignores a group with no lines', () => {
		const sections = groupBillingItems(items, name, {
			lineGroups: [
				{ id: 'a', label: 'A', keys: ['product:prod-Par'] },
				{ id: 'b', label: 'B', keys: ['product:prod-Par', 'product:prod-Gone'] }
			]
		});
		const labels = sections.flatMap((s) => s.lines.map((l) => l.label));
		expect(labels).toContain('A');
		expect(labels).not.toContain('B');
	});

	it('reads a malformed column as no groups', () => {
		expect(groupBillingItems(items, name, { lineGroups: 'nonsense' })).toHaveLength(3);
		expect(
			groupBillingItems(items, name, { lineGroups: [{ id: 1 }, null] }).flatMap((s) => s.lines)
		).toHaveLength(5);
	});
});
