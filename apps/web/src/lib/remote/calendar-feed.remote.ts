import { command, query } from '$app/server';
import { prisma } from '#lib/server/auth.js';
import { requireAuth } from '#lib/server/services/access.js';
import { calendarFeedUrl } from '#lib/server/services/calendar-feed.js';

export const getCalendarFeedUrl = query(async () => {
	const user = await requireAuth();
	const { calendarFeedVersion } = await prisma.user.findUniqueOrThrow({
		where: { id: user.id },
		select: { calendarFeedVersion: true }
	});
	return calendarFeedUrl(user.id, calendarFeedVersion);
});

/** Invalidates every feed link issued so far and hands out a new one. */
export const resetCalendarFeedUrl = command(async () => {
	const user = await requireAuth();
	await prisma.user.update({
		where: { id: user.id },
		data: { calendarFeedVersion: { increment: 1 } }
	});
	await getCalendarFeedUrl().refresh();
});
