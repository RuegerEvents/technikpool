import { query, command } from '$app/server';
import * as v from 'valibot';
import { requireAuth, requireOrgInventory } from '#lib/server/services/access.js';
import {
	cableColorScheme,
	mayReadCableColors,
	saveCableColorScheme,
	visibleCableColorSchemes
} from '#lib/server/services/cable-colors.js';

// An org's cable colour code — see src/lib/server/services/cable-colors.ts and
// docs/plans/kabelfarben.md. Read by every list that shows a cable; kept by
// ADMIN+ on the org page.

/**
 * The org's bands, shortest first. Someone who may not see them gets none
 * rather than an error: a list asks for the scheme of every owner it shows,
 * and a cable without a dot is the right answer there.
 */
export const getCableColors = query(v.string(), async (organizationId: string) => {
	const user = await requireAuth();
	if (!(await mayReadCableColors(user.id, organizationId))) return [];
	return cableColorScheme(organizationId);
});

/**
 * Every scheme the user's lists can need, one request for a whole page: their
 * own orgs' and those of every org lending to one of their productions.
 */
export const getCableColorSchemes = query(async () => {
	const user = await requireAuth();
	return visibleCableColorSchemes(user.id);
});

const bandSchema = v.object({
	maxLengthCm: v.pipe(v.number(), v.integer(), v.minValue(1)),
	paletteKey: v.optional(v.nullable(v.string())),
	customName: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(40)))),
	customHex: v.optional(v.nullable(v.string()))
});

export const saveCableColors = command(
	v.object({
		organizationId: v.string(),
		bands: v.pipe(v.array(bandSchema), v.maxLength(40))
	}),
	async ({ organizationId, bands }) => {
		await requireOrgInventory(organizationId);
		await saveCableColorScheme(organizationId, bands);
		await Promise.all([getCableColors(organizationId).refresh(), getCableColorSchemes().refresh()]);
	}
);
