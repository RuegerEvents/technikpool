import type { RequestHandler } from './$types';
import { handleApi, requireApiUser, type Schemas } from '#lib/server/api.js';
import { visibleCableColorSchemes } from '#lib/server/services/cable-colors.js';

// The cable colour codes for the scanner's lists — see openapi.yaml and
// docs/plans/kabelfarben.md. The client works a unit's colour out itself.
export const GET: RequestHandler = ({ locals }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		const schemes = await visibleCableColorSchemes(user.id);
		const body: Schemas['CableColorScheme'][] = schemes.map(({ organizationId, bands }) => ({
			organizationId,
			bands: bands.map((band) => ({
				maxLengthCm: band.maxLengthCm,
				paletteKey: band.paletteKey,
				customName: band.customName,
				customHex: band.customHex
			}))
		}));
		return Response.json(body);
	});
