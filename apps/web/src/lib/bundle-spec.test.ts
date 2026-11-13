import { describe, expect, it } from 'vitest';
import {
	bundleKey,
	countProducts,
	matchesSpec,
	roomFor,
	specShortfall,
	specSurplus,
	type BundleSpecLine
} from './bundle-spec';

const product = (productId: string, quantity: number): BundleSpecLine => ({
	kind: 'product',
	key: productId,
	productId,
	templateId: null,
	name: productId,
	manufacturerName: null,
	imagePath: null,
	quantity
});

const kit = (templateId: string, quantity: number): BundleSpecLine => ({
	kind: 'bundle',
	key: bundleKey(templateId),
	productId: null,
	templateId,
	name: templateId,
	manufacturerName: null,
	imagePath: null,
	quantity
});

// FOH Case: 1× PowerCon-Set, 4× Gender Changer.
const foh = [kit('powercon-set', 1), product('gender', 4)];

describe('countProducts with inner kits', () => {
	it('counts kits inside by their bundle type, apart from products', () => {
		const counts = countProducts(
			[{ productId: 'gender' }, { productId: 'gender' }],
			[{ templateId: 'powercon-set' }]
		);
		expect(counts.get('gender')).toBe(2);
		expect(counts.get(bundleKey('powercon-set'))).toBe(1);
		expect(counts.has('powercon-set')).toBe(false);
	});

	it('keeps a product and a bundle type of the same id apart', () => {
		const counts = countProducts([{ productId: 'x' }], [{ templateId: 'x' }]);
		expect(counts.get('x')).toBe(1);
		expect(counts.get(bundleKey('x'))).toBe(1);
	});
});

describe('the spec with a bundle-type line', () => {
	const units = (n: number) => Array.from({ length: n }, () => ({ productId: 'gender' }));

	it('is incomplete without the inner kit', () => {
		const counts = countProducts(units(4));
		expect(matchesSpec(foh, counts)).toBe(false);
		const short = specShortfall(foh, counts).filter((l) => l.missing > 0);
		expect(short).toEqual([{ line: foh[0], have: 0, missing: 1 }]);
	});

	it('matches with the inner kit and all units', () => {
		const counts = countProducts(units(4), [{ templateId: 'powercon-set' }]);
		expect(matchesSpec(foh, counts)).toBe(true);
	});

	it('has no room for a second inner kit, nor for a kit of another type', () => {
		const counts = countProducts(units(4), [{ templateId: 'powercon-set' }]);
		expect(roomFor(foh, counts, bundleKey('powercon-set'))).toBe(0);
		expect(roomFor(foh, counts, bundleKey('dmx-set'))).toBe(0);
		const over = countProducts(units(4), [
			{ templateId: 'powercon-set' },
			{ templateId: 'dmx-set' }
		]);
		expect(specSurplus(foh, over)).toEqual([{ key: bundleKey('dmx-set'), extra: 1 }]);
	});

	it('has room for the inner kit while it is missing', () => {
		expect(roomFor(foh, countProducts(units(2)), bundleKey('powercon-set'))).toBe(1);
		expect(roomFor(foh, countProducts(units(2)), 'gender')).toBe(2);
	});
});
