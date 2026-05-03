import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
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
