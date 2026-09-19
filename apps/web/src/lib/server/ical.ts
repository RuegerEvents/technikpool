// Minimal RFC 5545 writer — all-day events only, which is all a production is.

export type AllDayEvent = {
	/** Stable across fetches, or a calendar app duplicates the event on every refresh. */
	uid: string;
	/** First day. Only the UTC date is used — production dates are stored as UTC midnight. */
	start: Date;
	/** Last day, inclusive. */
	end: Date;
	summary: string;
	description?: string;
	location?: string;
	url?: string;
	/** A calendar app shows a cancelled event as such, where a dropped one just vanishes. */
	cancelled?: boolean;
	lastModified: Date;
};

const pad = (n: number) => String(n).padStart(2, '0');

function formatDate(d: Date): string {
	return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

function formatDateTime(d: Date): string {
	return `${formatDate(d)}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function escapeText(value: string): string {
	return value
		.replace(/\\/g, '\\\\')
		.replace(/;/g, '\\;')
		.replace(/,/g, '\\,')
		.replace(/\r?\n/g, '\\n');
}

const encoder = new TextEncoder();

/**
 * Lines are capped at 75 *octets*, not characters, so an umlaut near the edge
 * counts twice. Iterating by code point keeps a multi-byte character from being
 * split across the fold.
 */
function fold(line: string): string {
	const out: string[] = [];
	let current = '';
	let bytes = 0;
	for (const char of line) {
		const size = encoder.encode(char).length;
		// Continuation lines spend one octet on their leading space.
		const limit = out.length === 0 ? 75 : 74;
		if (bytes + size > limit) {
			out.push(current);
			current = '';
			bytes = 0;
		}
		current += char;
		bytes += size;
	}
	out.push(current);
	return out.join('\r\n ');
}

export function renderCalendar(opts: { name: string; events: AllDayEvent[] }): string {
	const lines = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//Technikpool//Productions//DE',
		'CALSCALE:GREGORIAN',
		`X-WR-CALNAME:${escapeText(opts.name)}`,
		// A hint only: Google ignores both and refreshes on its own schedule.
		'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
		'X-PUBLISHED-TTL:PT1H'
	];

	for (const event of opts.events) {
		// DTEND on a date is exclusive, so a one-day event ends the day after.
		const endExclusive = new Date(
			Date.UTC(event.end.getUTCFullYear(), event.end.getUTCMonth(), event.end.getUTCDate() + 1)
		);
		lines.push(
			'BEGIN:VEVENT',
			`UID:${event.uid}`,
			`DTSTAMP:${formatDateTime(event.lastModified)}`,
			`LAST-MODIFIED:${formatDateTime(event.lastModified)}`,
			`DTSTART;VALUE=DATE:${formatDate(event.start)}`,
			`DTEND;VALUE=DATE:${formatDate(endExclusive)}`,
			`SUMMARY:${escapeText(event.summary)}`
		);
		if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
		if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
		if (event.url) lines.push(`URL:${event.url}`);
		if (event.cancelled) lines.push('STATUS:CANCELLED');
		lines.push('TRANSP:TRANSPARENT', 'END:VEVENT');
	}

	lines.push('END:VCALENDAR');
	return lines.map(fold).join('\r\n') + '\r\n';
}
