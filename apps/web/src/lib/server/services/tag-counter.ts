import type { Prisma } from '#lib/prisma/client.js';
import { appError } from '#lib/errors.js';

// An org's automatic asset tags: its prefix and five digits, "40000186".
// Switched on per org (`Organization.autoAssetTags`); off, a unit without a
// tag stays without one, since a number nobody printed is on no sticker.
//
// The next number is the larger of two things: the org's stored counter, which
// only ever grows and so never hands a number out twice, and one past the
// highest tag already in the pattern — which is how a sticker typed or scanned
// by hand pushes the counter along without every place that writes a tag
// having to know about it. Tags outside the pattern are no number at all.

const DIGITS = 5;

export type TagAllocator = {
	/** Whether the org numbers new units at all. */
	enabled: boolean;
	/** The next free tag. Only while `enabled` — a caller asks first. */
	next(): string;
	/** Store where the counter got to. Every caller that drew a tag calls it. */
	done(): Promise<void>;
};

type Tx = Pick<Prisma.TransactionClient, 'organization' | '$queryRaw'>;

/**
 * The highest number among the tags already in the pattern, or 0.
 *
 * The `::int` casts are load-bearing. The pg adapter binds a JS number without
 * a type, and `substring(text FROM unknown)` resolves to the *regex* overload:
 * the start position became a pattern, nothing matched, and the counter alone
 * decided — so a sticker typed above it was handed out a second time.
 */
async function highestInPattern(tx: Tx, prefix: string) {
	const start = prefix.length + 1;
	const [{ highest }] = await tx.$queryRaw<{ highest: number | null }[]>`
		SELECT max(substring("assetTag" FROM ${start}::int)::int) AS highest
		FROM "Asset"
		WHERE left("assetTag", ${prefix.length}::int) = ${prefix}
		  AND substring("assetTag" FROM ${start}::int) ~ '^[0-9]{5}$'`;
	return highest ?? 0;
}

/** The number in a tag of the pattern, or null for any other tag. */
function numberOf(prefix: string, tag: string | null | undefined) {
	const rest = tag?.trim().startsWith(prefix) ? tag.trim().slice(prefix.length) : null;
	return rest && /^[0-9]{5}$/.test(rest) ? Number(rest) : null;
}

export function formatTag(prefix: string, n: number) {
	return `${prefix}${String(n).padStart(DIGITS, '0')}`;
}

/**
 * Hands out an org's next tags for the length of one transaction. The org row
 * is locked first, so two batches created at the same moment take turns rather
 * than drawing the same numbers.
 */
export async function tagAllocator(
	tx: Tx,
	organizationId: string,
	/** Tags typed into the same batch, not yet written — the count goes past them too. */
	typed: (string | null | undefined)[] = []
): Promise<TagAllocator> {
	// An update that changes nothing still takes the row lock, and holds it
	// until the transaction ends.
	const org = await tx.organization.update({
		where: { id: organizationId },
		data: { nextAssetTagNumber: { increment: 0 } },
		select: { assetIdPrefix: true, autoAssetTags: true, nextAssetTagNumber: true }
	});
	if (!org.autoAssetTags) {
		return {
			enabled: false,
			next: () => appError(400, 'asset_tag_required'),
			done: async () => {}
		};
	}

	const prefix = org.assetIdPrefix;
	const start = Math.max(
		org.nextAssetTagNumber,
		(await highestInPattern(tx, prefix)) + 1,
		...typed.map((tag) => (numberOf(prefix, tag) ?? 0) + 1)
	);
	let n = start;
	return {
		enabled: true,
		next: () => formatTag(prefix, n++),
		done: async () => {
			if (n === org.nextAssetTagNumber) return;
			await tx.organization.update({
				where: { id: organizationId },
				data: { nextAssetTagNumber: n }
			});
		}
	};
}

/** What the next automatic tag would be, for a form's placeholder. Draws nothing. */
export async function peekNextTag(tx: Tx, organizationId: string): Promise<string | null> {
	const org = await tx.organization.findUniqueOrThrow({
		where: { id: organizationId },
		select: { assetIdPrefix: true, autoAssetTags: true, nextAssetTagNumber: true }
	});
	if (!org.autoAssetTags) return null;
	const prefix = org.assetIdPrefix;
	return formatTag(
		prefix,
		Math.max(org.nextAssetTagNumber, (await highestInPattern(tx, prefix)) + 1)
	);
}
