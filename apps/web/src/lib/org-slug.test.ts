import { describe, expect, it } from 'vitest';
import { slugSource, slugify, uniqueSlug } from './org-slug.ts';

describe('slugify', () => {
	it('spells out umlauts and dashes everything else', () => {
		expect(slugify('Rüger Events - Software & Technik')).toBe('rueger-events-software-technik');
		expect(slugify('Straße 42 GmbH')).toBe('strasse-42-gmbh');
	});

	it('cuts a long name after a whole word', () => {
		expect(slugify('Rüger Events - Software und Veranstaltungstechnik')).toBe(
			'rueger-events-software-und'
		);
	});

	it('never comes out empty', () => {
		expect(slugify('★★★')).toBe('org');
	});
});

describe('uniqueSlug', () => {
	it('numbers a name that is taken', async () => {
		const taken = new Set(['test', 'test-2']);
		expect(await uniqueSlug('Test', async (s) => taken.has(s))).toBe('test-3');
	});
});

describe('slugSource', () => {
	it('prefers the short name', () => {
		expect(
			slugify(
				slugSource({ name: 'Rüger Events - Software und Technik', shortName: 'Rüger Events' })
			)
		).toBe('rueger-events');
		expect(slugSource({ name: 'Acme Corp', shortName: '  ' })).toBe('Acme Corp');
	});
});
