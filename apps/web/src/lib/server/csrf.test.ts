import { describe, expect, it } from 'vitest';
import { isCsrfForbidden } from './csrf';

const SELF = 'https://technikpool.example.com';

function req(method: string, headers: Record<string, string> = {}) {
	return new Request(`${SELF}/api/v1/products/x`, { method, headers });
}

describe('isCsrfForbidden', () => {
	it('lets reads through', () => {
		expect(isCsrfForbidden(req('GET'), SELF)).toBe(false);
	});

	it('refuses a bodyless cross-site DELETE, as Kit would', () => {
		expect(isCsrfForbidden(req('DELETE'), SELF)).toBe(true);
		expect(isCsrfForbidden(req('POST', { origin: 'https://evil.example' }), SELF)).toBe(true);
	});

	it('refuses a cross-site form post', () => {
		const headers = {
			'content-type': 'application/x-www-form-urlencoded',
			origin: 'https://evil.example'
		};
		expect(isCsrfForbidden(req('POST', headers), SELF)).toBe(true);
	});

	it('lets a same-origin form post through', () => {
		const headers = { 'content-type': 'multipart/form-data; boundary=x', origin: SELF };
		expect(isCsrfForbidden(req('POST', headers), SELF)).toBe(false);
	});

	it('lets JSON through, which a form cannot send', () => {
		expect(isCsrfForbidden(req('PATCH', { 'content-type': 'application/json' }), SELF)).toBe(false);
	});

	it('lets a bodyless request with a bearer token through', () => {
		expect(isCsrfForbidden(req('DELETE', { authorization: 'Bearer abc' }), SELF)).toBe(false);
		expect(isCsrfForbidden(req('POST', { authorization: 'Bearer ' }), SELF)).toBe(true);
	});
});
