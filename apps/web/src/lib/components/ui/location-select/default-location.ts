/**
 * What a form pre-fills for new units of an org: the user's starred location
 * when it is still one they can pick, else the org's first own location, else
 * nothing — a friend's shelf is never guessed, only starred.
 */
export function defaultLocationFor(
	locations: { id: string; organizationId: string }[],
	organizationId: string,
	defaults: Record<string, string> | undefined
): string {
	const starred = defaults?.[organizationId];
	if (starred && locations.some((l) => l.id === starred)) return starred;
	return locations.find((l) => l.organizationId === organizationId)?.id ?? '';
}
