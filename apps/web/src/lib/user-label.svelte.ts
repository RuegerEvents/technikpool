// How a person is named wherever a record points at them. History outlives the
// account it was written by: deleting an account nulls the reference instead of
// the entry, so every one of those places needs a name for "nobody any more".
// `.svelte.ts` so wuchale extracts it, and usable from the server like
// error-messages.svelte.ts.

type Person = { name: string | null; email: string } | null | undefined;

export function userLabel(user: Person): string {
	if (!user) return 'Deleted account';
	return user.name || user.email;
}
