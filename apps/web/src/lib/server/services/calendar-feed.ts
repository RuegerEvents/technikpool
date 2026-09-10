import { createHmac, timingSafeEqual } from 'node:crypto';
import { prisma } from '$lib/server/auth';
import { appBaseUrl } from '$lib/server/app-url';
import { renderCalendar, type AllDayEvent } from '$lib/server/ical';
import { orgLabel } from '$lib/utils';
import { userOrgIds } from './access';

// A calendar app subscribes to a URL and polls it with no cookie and no bearer
// token, so the URL itself is the credential. It is signed rather than stored:
// the signature covers the user id and User.calendarFeedVersion, and bumping
// the version is what revokes a leaked link without touching anyone else's.

function sign(userId: string, version: number): string {
	const secret = process.env.BETTER_AUTH_SECRET;
	if (!secret) throw new Error('BETTER_AUTH_SECRET is not set');
	// The prefix keeps this signature from being valid for anything else that
	// ever gets signed with the same secret.
	return createHmac('sha256', secret)
		.update(`calendar-feed:${userId}:${version}`)
		.digest('base64url');
}

export function calendarFeedUrl(userId: string, version: number): string {
	return `${appBaseUrl}/api/calendar/${encodeURIComponent(userId)}/${sign(userId, version)}.ics`;
}

export async function verifyCalendarFeed(userId: string, signature: string): Promise<boolean> {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { calendarFeedVersion: true }
	});
	if (!user) return false;
	const expected = Buffer.from(sign(userId, user.calendarFeedVersion));
	const given = Buffer.from(signature);
	return given.length === expected.length && timingSafeEqual(given, expected);
}

const formatDay = (d: Date) =>
	`${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}`;

/**
 * Every dated production in the user's orgs — the same scope as the calendar
 * page. Membership is resolved on each fetch, so leaving an org drops its
 * productions from the feed on the next refresh.
 */
export async function renderProductionsCalendar(userId: string): Promise<string> {
	const productions = await prisma.production.findMany({
		where: {
			organizationId: { in: await userOrgIds(userId) },
			startDate: { not: null },
			endDate: { not: null }
		},
		include: {
			organization: { select: { name: true, shortName: true } },
			address: true,
			customer: { select: { companyName: true, contactPerson: true } }
		},
		orderBy: { startDate: 'asc' }
	});

	const events = productions.flatMap((p): AllDayEvent[] => {
		if (!p.startDate || !p.endDate) return [];

		// Server-side copy is German, like the emails: a calendar app fetches
		// with no locale cookie to go by.
		const lines = [`Organisation: ${orgLabel(p.organization)}`];
		const showStart = p.showStartDate ?? p.startDate;
		const showEnd = p.showEndDate ?? p.endDate;
		if (
			showStart.getTime() !== p.startDate.getTime() ||
			showEnd.getTime() !== p.endDate.getTime()
		) {
			lines.push(`Show: ${formatDay(showStart)} – ${formatDay(showEnd)}`);
		}
		const customer = p.customer?.companyName || p.customer?.contactPerson;
		if (customer) lines.push(`Kunde: ${customer}`);

		const url = `${appBaseUrl}/productions/${p.id}`;
		lines.push('', url);

		return [
			{
				uid: `${p.id}@technikpool`,
				start: p.startDate,
				end: p.endDate,
				summary: p.name,
				description: lines.join('\n'),
				location: p.address
					? [p.address.line1, p.address.line2, `${p.address.postalCode} ${p.address.city}`.trim()]
							.filter(Boolean)
							.join(', ')
					: undefined,
				url,
				lastModified: p.updatedAt
			}
		];
	});

	return renderCalendar({ name: 'Technikpool – Produktionen', events });
}
