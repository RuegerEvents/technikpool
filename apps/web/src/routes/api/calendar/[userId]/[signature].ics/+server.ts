import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { renderProductionsCalendar, verifyCalendarFeed } from '$lib/server/services/calendar-feed';

// Polled by calendar apps without a session: the signed path is the only
// credential. A bad signature is a 404 rather than a 401, so probing the route
// doesn't reveal which user ids exist.
export const GET: RequestHandler = async ({ params }) => {
	if (!(await verifyCalendarFeed(params.userId, params.signature))) error(404, 'Not found');

	return new Response(await renderProductionsCalendar(params.userId), {
		headers: {
			'content-type': 'text/calendar; charset=utf-8',
			'content-disposition': 'inline; filename="technikpool-produktionen.ics"',
			'cache-control': 'private, max-age=300'
		}
	});
};
