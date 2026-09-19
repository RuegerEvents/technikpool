import { appError } from '$lib/errors';

/**
 * A cancelled production takes nothing new — no units, bundles, crew or
 * checkouts — until it is reopened. What it already holds can still be taken
 * off it, and units checked out to it still come back the ordinary way.
 */
export function requireOpenProduction(production: { cancelledAt: Date | null }) {
	if (production.cancelledAt) appError(409, 'production_cancelled');
}
