/**
 * Columns a list never shows. Omitted from the rows a list carries along with
 * each unit — its product, category, maker, shelf — where they were a tenth of
 * the device list's size.
 */
export const NO_TIMESTAMPS = { createdAt: true, updatedAt: true } as const;

/** The keys whose objects repeat across a list's rows: the same product on forty units. */
const SHARED_KEYS = new Set([
	'product',
	'category',
	'manufacturer',
	'location',
	'organization',
	'template'
]);

/**
 * Makes rows that name the same product, category, maker, shelf or org point at
 * one object instead of forty equal copies. SvelteKit's serializer (devalue)
 * writes an object it has already written as a reference, so a repeated object
 * is sent once: the device list went from 314 to 192 KB on 234 units, and the
 * browser parses that much less.
 *
 * An object is shared only with one of the same `id` *and* the same keys, so a
 * thin `{ id, name }` stand-in is never swapped for a full row or the other way
 * round. Rows are changed in place and returned; nothing reads them afterwards
 * but the serializer, and no client code writes into a query's result.
 */
export function shareRepeated<T>(rows: T): T {
	const seen = new Map<string, object>();
	const visit = (value: unknown): unknown => {
		if (Array.isArray(value)) {
			for (let i = 0; i < value.length; i++) value[i] = visit(value[i]);
			return value;
		}
		if (!value || typeof value !== 'object' || value instanceof Date) return value;
		const record = value as Record<string, unknown>;
		for (const [key, child] of Object.entries(record)) {
			if (SHARED_KEYS.has(key) && isIdentified(child)) {
				const signature = `${key}:${child.id}:${Object.keys(child).join(',')}`;
				const first = seen.get(signature);
				if (first) {
					record[key] = first;
					continue;
				}
				seen.set(signature, child);
			}
			record[key] = visit(child);
		}
		return record;
	};
	return visit(rows) as T;
}

function isIdentified(value: unknown): value is { id: string } {
	return (
		!!value &&
		typeof value === 'object' &&
		!Array.isArray(value) &&
		typeof (value as { id?: unknown }).id === 'string'
	);
}
