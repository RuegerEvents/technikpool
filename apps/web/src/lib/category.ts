import { page } from '$app/state';

/**
 * Which name a category shows under.
 *
 * English is the source name — the API returns it, and a billing line
 * snapshots it — so a missing German translation falls back to it rather than
 * rendering an empty chip.
 */
export function categoryLabel(
	category: { name: string; nameDe?: string | null },
	locale?: string
): string {
	const active = locale ?? currentLocale();
	return active === 'de' ? category.nameDe?.trim() || category.name : category.name;
}

/** Same choice for a pair of snapshotted names on a billing line. */
export function localizedName(
	name: string | null | undefined,
	nameDe: string | null | undefined,
	locale?: string
): string {
	const active = locale ?? currentLocale();
	if (active === 'de' && nameDe?.trim()) return nameDe;
	return name ?? '';
}

// The locale lives in a cookie and is handed to every page through the root
// layout, so any component can read it without a prop chain.
function currentLocale(): string {
	return (page.data as { locale?: string } | undefined)?.locale ?? 'de';
}
