import type { Transport } from '@sveltejs/kit';
import { Prisma } from '$lib/prisma/browser';

// Prisma `Decimal` fields (netPurchasePrice, ratePercent, ...) come back as
// Decimal.js instances, which devalue can't stringify as a POJO. Teach
// SvelteKit's remote-function/load serializer how to (de)serialize them.
//
// The server-side query engine's Decimal class is a separate module instance
// from `Prisma.Decimal` here (dual-package hazard via the generated client's
// bundled runtime), so `instanceof` silently fails to match real values.
// Decimal.js instances carry a static `isDecimal` that duck-types across
// module instances — use that instead.
function isDecimalLike(value: unknown): value is InstanceType<typeof Prisma.Decimal> {
	return (
		value !== null &&
		typeof value === 'object' &&
		typeof (value as { constructor?: { isDecimal?: unknown } }).constructor?.isDecimal ===
			'function' &&
		(value as { constructor: { isDecimal: (v: unknown) => boolean } }).constructor.isDecimal(value)
	);
}

export const transport: Transport = {
	Decimal: {
		encode: (value) => isDecimalLike(value) && [value.toString()],
		decode: ([str]) => new Prisma.Decimal(str)
	}
};
