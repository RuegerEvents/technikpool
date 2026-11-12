/* eslint-disable svelte/prefer-svelte-reactivity -- every Date here is a throwaway value, never state */
import { categoryLabel } from '#lib/category.js';

// How a unit's inspection state reads on screen. The date itself is derived on
// the server (see `inspectionDue`); this only decides how alarming it looks.

/** The window the inspections page calls "upcoming". */
export const DUE_SOON_DAYS = 30;

export type InspectionState = 'overdue' | 'soon' | 'ok';

export function inspectionState(due: Date | string | null): InspectionState | null {
	if (!due) return null;
	const time = new Date(due).getTime();
	if (time < Date.now()) return 'overdue';
	if (time < Date.now() + DUE_SOON_DAYS * 86_400_000) return 'soon';
	return 'ok';
}

export function inspectionTone(state: InspectionState | null): string {
	return state === 'overdue'
		? 'text-destructive'
		: state === 'soon'
			? 'text-amber-600 dark:text-amber-500'
			: '';
}

/** A type's name in the reader's language, like a category's. */
export function inspectionTypeLabel(type: { name: string; nameDe?: string | null }): string {
	return categoryLabel(type);
}

export function inspectionResultLabel(result: string): string {
	return result === 'FAILED' ? 'Failed' : 'Passed';
}

/** Today as YYYY-MM-DD in the browser's own time zone, for a date input. */
export function localToday(): string {
	return new Date().toLocaleDateString('sv-SE');
}

/** A stored inspection day (midnight UTC) for display. */
export function formatInspectionDay(date: Date | string): string {
	return new Date(date).toLocaleDateString('de-DE', { timeZone: 'UTC' });
}

/** A due date as MM/YYYY — "valid until" on a customer's page needs no more. */
export function formatInspectionMonth(date: Date | string): string {
	return new Date(date).toLocaleDateString('de-DE', {
		month: '2-digit',
		year: 'numeric',
		timeZone: 'UTC'
	});
}
