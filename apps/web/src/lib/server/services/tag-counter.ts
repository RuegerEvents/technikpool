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
/** The last number the pattern holds. Past it, numbering starts over from the lowest free one. */
const MAX = 10 ** DIGITS - 1;
/** How close to the end a batch starts before the numbers in use are read — see `tagAllocator`. */
const REUSE_MARGIN = 1000;

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

/** Every number already in the pattern — for starting over once the range is spent. */
async function numbersInPattern(tx: Tx, prefix: string) {
	const start = prefix.length + 1;
	const rows = await tx.$queryRaw<{ n: number }[]>`
		SELECT substring("assetTag" FROM ${start}::int)::int AS n
		FROM "Asset"
		WHERE left("assetTag", ${prefix.length}::int) = ${prefix}
		  AND substring("assetTag" FROM ${start}::int) ~ '^[0-9]{5}$'`;
	return new Set(rows.map((r) => r.n));
}

/** The lowest number of the pattern no unit carries, or null when all are taken. */
async function lowestFree(tx: Tx, prefix: string) {
	const [free] = await tx.$queryRaw<{ n: number }[]>`
		SELECT s.n::int AS n
		FROM generate_series(1, ${MAX}::int) AS s(n)
		WHERE NOT EXISTS (
			SELECT 1 FROM "Asset" WHERE "assetTag" = ${prefix} || lpad(s.n::text, ${DIGITS}::int, '0')
		)
		ORDER BY s.n
		LIMIT 1`;
	return free?.n ?? null;
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
	const typedNumbers = typed
		.map((tag) => numberOf(prefix, tag))
		.filter((n): n is number => n !== null);
	const start = Math.max(
		org.nextAssetTagNumber,
		(await highestInPattern(tx, prefix)) + 1,
		...typedNumbers.map((n) => n + 1)
	);
	let n = start;
	// Where a batch could run past the end of the range — a sticker typed as
	// …99999 puts the count there in one go — what is taken is read up front,
	// so the rest come from the lowest free numbers rather than as tags one
	// digit too long, which no pattern would ever count. `next` is synchronous,
	// so it has to be read before the first draw; a batch of more than this
	// margin that also crosses the end is refused instead.
	const taken = start + REUSE_MARGIN > MAX ? await numbersInPattern(tx, prefix) : null;
	typedNumbers.forEach((t) => taken?.add(t));
	let reuse = 1;
	return {
		enabled: true,
		next: () => {
			if (n <= MAX) return formatTag(prefix, n++);
			if (!taken) return appError(409, 'asset_tag_required');
			while (reuse <= MAX && taken.has(reuse)) reuse++;
			if (reuse > MAX) return appError(409, 'asset_tag_required');
			taken.add(reuse);
			return formatTag(prefix, reuse++);
		},
		done: async () => {
			const stored = Math.min(n, MAX + 1);
			if (stored === org.nextAssetTagNumber) return;
			await tx.organization.update({
				where: { id: organizationId },
				data: { nextAssetTagNumber: stored }
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
	const next = Math.max(org.nextAssetTagNumber, (await highestInPattern(tx, prefix)) + 1);
	if (next <= MAX) return formatTag(prefix, next);
	const free = await lowestFree(tx, prefix);
	return free === null ? null : formatTag(prefix, free);
}

/**
 * Sets the counter back to one past the highest number units actually carry.
 * The counter only ever grows, so a number typed high by mistake — or one
 * whose unit was deleted since — keeps every later device up there for good.
 * The numbers above that are free again: deleted units' among them, which is
 * the one promise this takes back, and why it is asked for, not automatic.
 */
export async function resetTagCounter(tx: Tx, organizationId: string) {
	const { assetIdPrefix: prefix } = await tx.organization.findUniqueOrThrow({
		where: { id: organizationId },
		select: { assetIdPrefix: true }
	});
	const next = Math.min((await highestInPattern(tx, prefix)) + 1, MAX + 1);
	await tx.organization.update({
		where: { id: organizationId },
		data: { nextAssetTagNumber: next }
	});
}

/**
 * For an org that does not number its units: the highest tag already in its
 * pattern, and the number a form can offer to fill in by hand — one past the
 * highest, or, once that has reached the end of the pattern, the lowest number
 * still free. Draws nothing and moves no counter: the tag only counts once a
 * unit carries it.
 */
export async function suggestTag(
	tx: Tx,
	organizationId: string
): Promise<{
	highest: string | null;
	next: string | null;
	/** The counter has run ahead of every number in use — see `resetTagCounter`. */
	counterAhead: boolean;
	/** What the counter would be reset to. */
	resetTo: string;
}> {
	const { assetIdPrefix: prefix, nextAssetTagNumber } = await tx.organization.findUniqueOrThrow({
		where: { id: organizationId },
		select: { assetIdPrefix: true, nextAssetTagNumber: true }
	});
	const highest = await highestInPattern(tx, prefix);
	const last = highest > 0 ? formatTag(prefix, highest) : null;
	const base = {
		highest: last,
		counterAhead: nextAssetTagNumber > highest + 1,
		resetTo: formatTag(prefix, Math.min(highest + 1, MAX))
	};
	if (highest < MAX) return { ...base, next: formatTag(prefix, highest + 1) };
	// A sticker typed at the end of the range (…99999) leaves nothing above it,
	// but usually most of the range below.
	const free = await lowestFree(tx, prefix);
	return { ...base, next: free === null ? null : formatTag(prefix, free) };
}
