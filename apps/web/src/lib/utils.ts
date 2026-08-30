import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function plural(num: number, candidates: string[], rule = (n: number) => (n === 1 ? 0 : 1)) {
	return candidates[rule(num)].replace('#', String(num));
}

// What to call an org in the UI: its short name when one is set, otherwise the
// full name. Legal documents (offers, invoices) always print the full name.
export function orgLabel(org: { name: string; shortName?: string | null }): string {
	return org.shortName?.trim() || org.name;
}

/** A customer may have a company, a person, or neither — never assume one. */
export function customerLabel(c: {
	companyName: string | null;
	contactPerson: string | null;
}): string {
	return c.companyName || c.contactPerson || 'Unnamed customer';
}

// Inclusive day count between two dates (a single day counts as 1, not 0).
export function dayCountBetween(
	start: Date | string | null | undefined,
	end: Date | string | null | undefined
): number | null {
	if (!start || !end) return null;
	const startMs = new Date(start).getTime();
	const endMs = new Date(end).getTime();
	return Math.max(1, Math.round((endMs - startMs) / 86_400_000) + 1);
}

// SvelteKit remote functions reject with an `HttpError` (`{status, body: {message}}`),
// not a plain `Error` — `(err as Error).message` is always undefined for those.
export function getErrorMessage(err: unknown): string {
	if (err && typeof err === 'object') {
		if ('body' in err && err.body && typeof err.body === 'object' && 'message' in err.body) {
			const message = (err.body as { message?: unknown }).message;
			if (typeof message === 'string' && message) return message;
		}
		if ('message' in err) {
			const message = (err as { message?: unknown }).message;
			if (typeof message === 'string' && message) return message;
		}
	}
	return 'An unexpected error occurred';
}

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function formatAddress(
	addr:
		| {
				line1?: string | null;
				line2?: string | null;
				postalCode?: string | null;
				city?: string | null;
		  }
		| null
		| undefined
): string {
	if (!addr) return '';
	const parts = [
		addr.line1?.trim(),
		addr.line2?.trim(),
		[addr.postalCode?.trim(), addr.city?.trim()].filter(Boolean).join(' ')
	].filter(Boolean);
	return parts.join(' · ');
}

function parseHexColor(input: string): [number, number, number] | null {
	const hex = input.trim();
	if (!hex.startsWith('#')) return null;
	const raw = hex.slice(1);
	if (!/^[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(raw)) return null;

	const normalized =
		raw.length === 3
			? raw
					.split('')
					.map((c) => c + c)
					.join('')
			: raw;
	const n = Number.parseInt(normalized, 16);
	const r = (n >> 16) & 255;
	const g = (n >> 8) & 255;
	const b = n & 255;
	return [r, g, b];
}

export function getContrastingTextColor(background: string): '#000000' | '#ffffff' {
	const rgb = parseHexColor(background);
	if (!rgb) return '#000000';

	const [r8, g8, b8] = rgb;
	const [r, g, b] = [r8 / 255, g8 / 255, b8 / 255].map((c) =>
		c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
	);
	const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

	return luminance > 0.3 ? '#000000' : '#ffffff';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, 'child'> : T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, 'children'> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null };
