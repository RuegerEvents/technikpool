import { describe, expect, it } from 'vitest';
import { peekNextTag, resetTagCounter, suggestTag, tagAllocator } from './tag-counter.ts';

// The numbering against a stand-in for the database: the org row, and the
// tags units carry. The three queries are told apart by what they ask for.
function fakeTx(org: { nextAssetTagNumber: number; autoAssetTags?: boolean }, tags: string[]) {
	const prefix = '143';
	const state = { assetIdPrefix: prefix, autoAssetTags: true, ...org };
	const inPattern = () =>
		tags
			.filter((t) => t.startsWith(prefix) && /^[0-9]{5}$/.test(t.slice(prefix.length)))
			.map((t) => Number(t.slice(prefix.length)));
	return {
		state,
		organization: {
			update: async ({ data }: { data: { nextAssetTagNumber: number | object } }) => {
				if (typeof data.nextAssetTagNumber === 'number') {
					state.nextAssetTagNumber = data.nextAssetTagNumber;
				}
				return state;
			},
			findUniqueOrThrow: async () => state
		},
		$queryRaw: async (strings: TemplateStringsArray) => {
			const sql = strings.join('?');
			if (sql.includes('max(')) return [{ highest: Math.max(0, ...inPattern()) || null }];
			if (sql.includes('generate_series')) {
				const taken = new Set(inPattern());
				for (let n = 1; n <= 99999; n++) if (!taken.has(n)) return [{ n }];
				return [];
			}
			return inPattern().map((n) => ({ n }));
		}
	};
}

// The allocator is typed against Prisma's client; the stand-in covers what it calls.
type Tx = Parameters<typeof tagAllocator>[0];

describe('tag counter', () => {
	it('counts on from the stored counter or the highest tag, whichever is further', async () => {
		const tx = fakeTx({ nextAssetTagNumber: 5 }, ['14300003']);
		const tags = await tagAllocator(tx as unknown as Tx, 'org');
		expect([tags.next(), tags.next()]).toEqual(['14300005', '14300006']);
		await tags.done();
		expect(tx.state.nextAssetTagNumber).toBe(7);
	});

	it('starts over from the lowest free number once the range is spent', async () => {
		// Lukas: a sticker typed as …99999 used to send every later device to a
		// nine-digit tag no pattern counts.
		const tx = fakeTx({ nextAssetTagNumber: 1 }, ['14399999', '14300001']);
		const tags = await tagAllocator(tx as unknown as Tx, 'org');
		expect([tags.next(), tags.next()]).toEqual(['14300002', '14300003']);
		await tags.done();
		expect(tx.state.nextAssetTagNumber).toBe(100000);
	});

	it('skips numbers typed into the same batch when starting over', async () => {
		const tx = fakeTx({ nextAssetTagNumber: 1 }, ['14399999']);
		const tags = await tagAllocator(tx as unknown as Tx, 'org', ['14300001']);
		expect(tags.next()).toBe('14300002');
	});

	it('previews the lowest free number past the end, too', async () => {
		const tx = fakeTx({ nextAssetTagNumber: 1 }, ['14399999', '14300001']);
		expect(await peekNextTag(tx as unknown as Tx, 'org')).toBe('14300002');
	});

	it('resets the counter to one past the highest number in use', async () => {
		// The unit carrying a high number was deleted; the counter stayed up there.
		const tx = fakeTx({ nextAssetTagNumber: 5000 }, ['14300042']);
		expect((await suggestTag(tx as unknown as Tx, 'org')).counterAhead).toBe(true);
		await resetTagCounter(tx as unknown as Tx, 'org');
		expect(tx.state.nextAssetTagNumber).toBe(43);
		expect((await suggestTag(tx as unknown as Tx, 'org')).counterAhead).toBe(false);
	});
});
