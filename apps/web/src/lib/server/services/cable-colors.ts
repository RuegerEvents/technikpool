import { prisma } from '#lib/server/auth.js';
import { appError } from '#lib/errors.js';
import { HEX_COLOR, isPaletteKey, sortBands, type CableColorBand } from '#lib/cable-colors.js';
import { isSystemAdmin, userOrgIds } from './access';

// An org's cable colour code (docs/plans/kabelfarben.md), shared by the web's
// remote functions, /api/v1 and the PDFs. The pure half is #lib/cable-colors.ts.

const BAND_SELECT = {
	maxLengthCm: true,
	paletteKey: true,
	customName: true,
	customHex: true
} as const;

/** The org's bands, shortest first. */
export async function cableColorScheme(organizationId: string): Promise<CableColorBand[]> {
	const bands = await prisma.cableColorBand.findMany({
		where: { organizationId },
		select: BAND_SELECT,
		orderBy: { maxLengthCm: 'asc' }
	});
	return bands;
}

/** Several orgs' bands at once, for a list or a sheet that mixes owners. */
export async function cableColorSchemes(
	organizationIds: readonly string[]
): Promise<Map<string, CableColorBand[]>> {
	const ids = [...new Set(organizationIds)];
	const schemes = new Map<string, CableColorBand[]>(ids.map((id) => [id, []]));
	if (ids.length === 0) return schemes;
	const bands = await prisma.cableColorBand.findMany({
		where: { organizationId: { in: ids } },
		select: { organizationId: true, ...BAND_SELECT },
		orderBy: { maxLengthCm: 'asc' }
	});
	for (const { organizationId, ...band } of bands) schemes.get(organizationId)?.push(band);
	return schemes;
}

/**
 * Whether a user gets to see an org's scheme: a member of it (any role — the
 * colours are on the equipment), a system admin, or a member of an org that
 * a unit of it is lent to. Before a loan there is nothing to read the colours
 * off, so nothing is shown.
 */
export async function mayReadCableColors(userId: string, organizationId: string) {
	const orgIds = await userOrgIds(userId);
	if (orgIds.includes(organizationId)) return true;
	if (await isSystemAdmin(userId)) return true;
	const lent = await prisma.productionItem.findFirst({
		where: {
			status: { not: 'DECLINED' },
			asset: { organizationId },
			production: { organizationId: { in: orgIds } }
		},
		select: { id: true }
	});
	return lent !== null;
}

/**
 * Every scheme a user's equipment lists can need: their own orgs', and those
 * of every org with a unit on one of their productions. Orgs without bands
 * are left out.
 */
export async function visibleCableColorSchemes(userId: string) {
	const orgIds = (await isSystemAdmin(userId))
		? (await prisma.organization.findMany({ select: { id: true } })).map((o) => o.id)
		: await userOrgIds(userId);
	const lenders = await prisma.asset.findMany({
		where: {
			organizationId: { notIn: orgIds },
			productionItems: {
				some: { status: { not: 'DECLINED' }, production: { organizationId: { in: orgIds } } }
			}
		},
		select: { organizationId: true },
		distinct: ['organizationId']
	});
	const schemes = await cableColorSchemes([...orgIds, ...lenders.map((l) => l.organizationId)]);
	return [...schemes]
		.filter(([, bands]) => bands.length > 0)
		.map(([organizationId, bands]) => ({ organizationId, bands }));
}

export type CableColorBandInput = {
	maxLengthCm: number;
	paletteKey?: string | null;
	customName?: string | null;
	customHex?: string | null;
};

/**
 * Replaces the org's scheme with these bands. The caller has checked the
 * right (ADMIN+ of the org). Bounds are unique, colours either a palette key
 * or a name and a `#rrggbb` of the org's own.
 */
export async function saveCableColorScheme(
	organizationId: string,
	input: readonly CableColorBandInput[]
): Promise<CableColorBand[]> {
	const bands = sortBands(
		input.map((band) => {
			const paletteKey = band.paletteKey?.trim() || null;
			const customName = band.customName?.trim() || null;
			const customHex = band.customHex?.trim().toLowerCase() || null;
			if (!Number.isInteger(band.maxLengthCm) || band.maxLengthCm <= 0) {
				appError(400, 'cable_color_length_invalid');
			}
			if (paletteKey) {
				if (!isPaletteKey(paletteKey)) appError(400, 'cable_color_invalid');
				return { maxLengthCm: band.maxLengthCm, paletteKey, customName: null, customHex: null };
			}
			if (!customName || !customHex || !HEX_COLOR.test(customHex)) {
				appError(400, 'cable_color_invalid');
			}
			return { maxLengthCm: band.maxLengthCm, paletteKey: null, customName, customHex };
		})
	);
	for (let i = 1; i < bands.length; i++) {
		if (bands[i].maxLengthCm === bands[i - 1].maxLengthCm) {
			appError(409, 'cable_color_length_duplicate', [String(bands[i].maxLengthCm / 100)]);
		}
	}
	await prisma.$transaction([
		prisma.cableColorBand.deleteMany({ where: { organizationId } }),
		prisma.cableColorBand.createMany({
			data: bands.map((band) => ({ organizationId, ...band }))
		})
	]);
	return bands;
}
