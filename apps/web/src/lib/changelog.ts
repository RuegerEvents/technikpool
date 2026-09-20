import entries from './changelog.json';

// The release history shown on /whats-new, newest first.
//
// It is JSON rather than a `.svelte.ts` table because the entries are *content*,
// not interface copy: both languages are written in one sitting, by whoever
// cut the release, and belong next to each other where they can be diffed. Going
// through wuchale would scatter a release across en.po and de.po and make an
// entry translatable long after the release it describes has shipped.
//
// That is also why this is plain `.ts` — wuchale only extracts from `.svelte`
// and `.svelte.ts`, so nothing here lands in the catalogs by accident.
//
// The newest entry's version is the app's version: `pnpm release` refuses to cut
// a release this file has no entry for, so the two cannot drift.

export type Release = {
	version: string;
	/** ISO date the version was tagged. */
	date: string;
	en: string[];
	de: string[];
};

export const releases = entries as Release[];

/** The version this build announces — see the note above on why it is the newest entry. */
export const currentVersion = releases[0].version;

export function notesFor(release: Release, locale: string): string[] {
	return locale === 'de' ? release.de : release.en;
}

/** Shared so the dashboard's card and /whats-new never date the same release differently. */
export function formatReleaseDate(release: Release, locale: string): string {
	return new Date(release.date).toLocaleDateString(locale === 'en' ? 'en-GB' : 'de-DE', {
		year: 'numeric',
		month: 'long',
		day: 'numeric'
	});
}
