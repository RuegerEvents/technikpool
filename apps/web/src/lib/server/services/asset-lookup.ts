import { prisma } from '$lib/server/auth';
import { isSystemAdmin, userOrgIds } from './access';

// Turning a scanned code into one unit, in the one place both the web UI and
// /api/v1 go through. Framework-agnostic like the rest of this directory: it
// takes a user id and answers what the code picked out, and the caller decides
// what that means for its own error shape.

/** How a code was recognised — worth reporting, since the two are not equally certain. */
export type CodeMatchField = 'assetTag' | 'serialNumber';

export type ResolvedCode =
	| { kind: 'match'; assetId: string; matchedBy: CodeMatchField }
	| { kind: 'not_found' }
	| { kind: 'ambiguous' };

/**
 * Resolve a scanned code to a single asset.
 *
 * The asset tag is the label we print and it is unique across the install, so a
 * tag match wins outright and is never second-guessed. A serial number is the
 * manufacturer's: it is optional, free text, and nothing stops two rows holding
 * the same one. So it is a fallback, and only when it picks out exactly one
 * unit — two matches is a typo or a vendor that reuses serials, and quietly
 * picking the first would move the wrong device.
 *
 * The serial search is scoped to the orgs the user can already see, while the
 * tag search is not. That difference is deliberate: a tag is on a label in the
 * user's hand, so telling them it belongs to another org (`forbidden`, decided
 * by the caller) is useful. A serial they may have typed is a weaker claim to
 * the unit, and counting matches they could never act on would report an
 * ambiguity they cannot see or resolve.
 */
export async function resolveScannedCode(userId: string, code: string): Promise<ResolvedCode> {
	const trimmed = code.trim();
	if (!trimmed) return { kind: 'not_found' };

	const byTag = await prisma.asset.findFirst({
		where: { assetTag: trimmed },
		select: { id: true }
	});
	if (byTag) return { kind: 'match', assetId: byTag.id, matchedBy: 'assetTag' };

	// `take: 2` because the only question is whether there is more than one;
	// the exact number of duplicates changes nothing a user can do about it.
	const bySerial = await assetsWithSerial(userId, trimmed, { take: 2 });

	if (bySerial.length === 0) return { kind: 'not_found' };
	if (bySerial.length > 1) return { kind: 'ambiguous' };
	return { kind: 'match', assetId: bySerial[0].id, matchedBy: 'serialNumber' };
}

/**
 * The units a serial number would match for this user — the same set, and the
 * same scope, that `resolveScannedCode` counts. The asset form warns from this
 * before saving a duplicate, so what it warns about is exactly what would later
 * make a scan ambiguous, rather than a second opinion that could disagree.
 */
export async function assetsWithSerial(
	userId: string,
	serialNumber: string,
	options: { take?: number; excludeAssetId?: string } = {}
) {
	const trimmed = serialNumber.trim();
	if (!trimmed) return [];

	const orgIds = (await isSystemAdmin(userId)) ? null : await userOrgIds(userId);
	if (orgIds && orgIds.length === 0) return [];

	return await prisma.asset.findMany({
		where: {
			serialNumber: { equals: trimmed, mode: 'insensitive' },
			...(orgIds ? { organizationId: { in: orgIds } } : {}),
			...(options.excludeAssetId ? { id: { not: options.excludeAssetId } } : {})
		},
		select: {
			id: true,
			assetTag: true,
			organization: { select: { name: true, shortName: true } },
			product: { select: { name: true } }
		},
		orderBy: { id: 'asc' },
		take: options.take
	});
}
