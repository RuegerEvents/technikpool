// Helpers for code on the Prisma 8 client (`prisma8` in auth.ts).
//
// Prisma 8 decodes a `Timestamp(3)` column to a `Temporal.PlainDateTime`
// (there is no Date-backed codec), while every page, email and validator in
// this app works with `Date`. These helpers keep that conversion at the data
// layer's edge: a remote function converts on the way in and on the way out,
// and nothing above it learns about Temporal.
//
// Prisma 7 read the same `timestamp without time zone` columns as UTC, so the
// conversion here is UTC in both directions — the wire value is unchanged.

type PlainDateTime = Temporal.PlainDateTime;

/** A column value as Prisma 7 handed it out. */
export function toDate(value: PlainDateTime): Date;
export function toDate(value: PlainDateTime | null): Date | null;
export function toDate(value: PlainDateTime | null): Date | null {
	if (value === null) return null;
	return new Date(value.toZonedDateTime('UTC').epochMilliseconds);
}

/** A `Date` (or anything `new Date()` accepts) as a Prisma 8 write or comparison value. */
export function toTimestamp(value: Date | string | number): PlainDateTime;
export function toTimestamp(value: Date | string | number | null | undefined): PlainDateTime | null;
export function toTimestamp(
	value: Date | string | number | null | undefined
): PlainDateTime | null {
	if (value === null || value === undefined) return null;
	const date = value instanceof Date ? value : new Date(value);
	return Temporal.Instant.fromEpochMilliseconds(date.getTime())
		.toZonedDateTimeISO('UTC')
		.toPlainDateTime();
}

/** `updatedAt` has no database default in the contract, so every write sets it. */
export function now(): PlainDateTime {
	return toTimestamp(new Date());
}

/** The type of a query result after `dated()`: every PlainDateTime is a Date. */
export type Dated<T> = T extends PlainDateTime
	? Date
	: T extends Date
		? T
		: T extends ReadonlyArray<infer U>
			? Dated<U>[]
			: T extends object
				? { -readonly [K in keyof T]: Dated<T[K]> }
				: T;

function isPlainObject(value: object): value is Record<string, unknown> {
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
}

/**
 * Walk a query result and replace every PlainDateTime with a Date, so the
 * rows look exactly like the ones the Prisma 7 client returned.
 */
export function dated<T>(value: T): Dated<T> {
	if (value instanceof Temporal.PlainDateTime) return toDate(value) as Dated<T>;
	if (Array.isArray(value)) return value.map(dated) as Dated<T>;
	if (value !== null && typeof value === 'object' && isPlainObject(value)) {
		const out: Record<string, unknown> = {};
		for (const [key, entry] of Object.entries(value)) out[key] = dated(entry);
		return out as Dated<T>;
	}
	return value as Dated<T>;
}

/** Throws where Prisma 7's `findUniqueOrThrow` would have. */
export function must<T>(row: T | null, what: string): T {
	if (row === null) throw new Error(`${what} not found`);
	return row;
}
