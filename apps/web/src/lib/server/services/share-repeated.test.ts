import { describe, expect, it } from 'vitest';
import { shareRepeated } from './share-repeated';

describe('shareRepeated', () => {
	it('points rows naming the same product at one object', () => {
		const rows = [
			{ id: 'a1', product: { id: 'p1', name: 'Par', category: { id: 'c1', name: 'Light' } } },
			{ id: 'a2', product: { id: 'p1', name: 'Par', category: { id: 'c1', name: 'Light' } } },
			{ id: 'a3', product: { id: 'p2', name: 'Spot', category: { id: 'c1', name: 'Light' } } }
		];
		const out = shareRepeated(rows);
		expect(out[0].product).toBe(out[1].product);
		expect(out[2].product).not.toBe(out[0].product);
		// Nested too: a category shared by two different products.
		expect(out[2].product.category).toBe(out[0].product.category);
		expect(out[1]).toEqual({
			id: 'a2',
			product: { id: 'p1', name: 'Par', category: { id: 'c1', name: 'Light' } }
		});
	});

	it('shares inside accessories as well', () => {
		const rows = [
			{ id: 'a1', product: { id: 'p1' }, accessories: [{ id: 'x1', product: { id: 'p9' } }] },
			{ id: 'a2', product: { id: 'p1' }, accessories: [{ id: 'x2', product: { id: 'p9' } }] }
		];
		const out = shareRepeated(rows);
		expect(out[0].accessories[0].product).toBe(out[1].accessories[0].product);
	});

	it('never swaps objects of a different shape that share an id', () => {
		const rows = [
			{ id: 'a1', product: { id: 'p1', name: 'Par' } },
			{ id: 'a2', product: { id: 'p1', name: 'Par', caption: 'IP' } }
		];
		const out = shareRepeated(rows);
		expect(out[1].product).toEqual({ id: 'p1', name: 'Par', caption: 'IP' });
		expect(out[1].product).not.toBe(out[0].product);
	});

	it('leaves objects without an id and dates alone', () => {
		const when = new Date('2026-01-01');
		const rows = [
			{ id: 'a1', parent: { name: 'x' }, purchaseDate: when },
			{ id: 'a2', parent: { name: 'x' }, purchaseDate: when }
		];
		const out = shareRepeated(rows);
		expect(out[0].parent).not.toBe(out[1].parent);
		expect(out[0].purchaseDate).toBe(when);
	});
});
