import { describe, expect, it } from 'vitest';
import { byCategory, inventoryTiles, type InventoryUnit } from './bundle-inventory-pdf';

const unit = (
	id: string,
	productId: string,
	name: string,
	parentId: string | null = null
): InventoryUnit => ({ id, parentId, productId, name, maker: null, imagePath: null });

const shape = (tiles: ReturnType<typeof inventoryTiles>) =>
	tiles.map((t) => [t.count, t.name, t.accessoryOf]);

describe('inventoryTiles', () => {
	it('groups by category in its set order, accessories staying with their unit', () => {
		const licht = { sortOrder: 1, name: 'Licht' };
		const strom = { sortOrder: 2, name: 'Strom' };
		const tiles = byCategory([
			...inventoryTiles([
				{ ...unit('k1', 'cable', 'Ash Cable'), category: strom },
				{ ...unit('s1', 'spot', 'Spot'), category: licht },
				{ ...unit('b1', 'bracket', 'Bracket', 's1'), category: null },
				{ ...unit('x1', 'misc', 'Zip ties'), category: null }
			]),
			{
				kind: 'kit',
				count: 1,
				name: 'DMX-Ring',
				maker: null,
				imagePath: null,
				details: [],
				accessoryOf: null,
				category: licht
			}
		]);
		expect(shape(tiles)).toEqual([
			[1, 'Spot', null],
			[1, 'Bracket', 'Spot'],
			[1, 'DMX-Ring', null],
			[1, 'Ash Cable', null],
			[1, 'Zip ties', null]
		]);
	});

	it('gives each accessory a tile of its own, with the total, right after its unit', () => {
		const tiles = inventoryTiles([
			unit('s1', 'spot', 'Spot'),
			unit('s2', 'spot', 'Spot'),
			unit('b1', 'bracket', 'Bracket', 's1'),
			unit('b2', 'bracket', 'Bracket', 's1'),
			unit('b3', 'bracket', 'Bracket', 's2'),
			unit('b4', 'bracket', 'Bracket', 's2'),
			unit('c1', 'cable', 'Cable', 's1'),
			unit('c2', 'cable', 'Cable', 's2')
		]);
		expect(shape(tiles)).toEqual([
			[2, 'Spot', null],
			[4, 'Bracket', 'Spot'],
			[2, 'Cable', 'Spot']
		]);
	});

	it('splits units whose accessories differ, each followed by its own', () => {
		const tiles = inventoryTiles([
			unit('s1', 'spot', 'Spot'),
			unit('s2', 'spot', 'Spot'),
			unit('c1', 'cable', 'Cable', 's1')
		]);
		expect(shape(tiles)).toEqual([
			[1, 'Spot', null],
			[1, 'Spot', null],
			[1, 'Cable', 'Spot']
		]);
	});

	it('sorts naturally and counts an accessory of an accessory against the unit', () => {
		const tiles = inventoryTiles([
			unit('a', 'p10', 'Cable 10m'),
			unit('b', 'p2', 'Cable 2m'),
			unit('c', 'p2a', 'Adapter', 'b'),
			unit('d', 'p2b', 'Clip', 'c')
		]);
		expect(shape(tiles)).toEqual([
			[1, 'Cable 2m', null],
			[1, 'Adapter', 'Cable 2m'],
			[1, 'Clip', 'Cable 2m'],
			[1, 'Cable 10m', null]
		]);
	});
});
