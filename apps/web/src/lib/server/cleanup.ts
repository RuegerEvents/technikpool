import { prisma } from './auth';

// Rows that stop meaning anything once they expire, and some of them hold
// personal data — a session carries the IP address and user agent it signed in
// from. better-auth ignores an expired row but never removes it, so without
// this they would pile up for as long as the install runs.
//
// Sessions live 7 days from their last refresh (better-auth's default
// `expiresIn`), which makes that the retention period for the IP address; the
// privacy policy templates in docs/legal say so.

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// An invitation's expiry is still shown on /admin/users for a while, so the
// person who sent it can see that it ran out rather than have it vanish.
const INVITATION_GRACE = 30 * DAY;

export async function purgeExpired(now = new Date()) {
	const [sessions, verifications, deviceCodes, invitations] = await prisma.$transaction([
		prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }),
		prisma.verification.deleteMany({ where: { expiresAt: { lt: now } } }),
		prisma.deviceCode.deleteMany({ where: { expiresAt: { lt: now } } }),
		prisma.invitation.deleteMany({
			where: {
				acceptedAt: null,
				expiresAt: { lt: new Date(now.getTime() - INVITATION_GRACE) }
			}
		})
	]);
	return {
		sessions: sessions.count,
		verifications: verifications.count,
		deviceCodes: deviceCodes.count,
		invitations: invitations.count
	};
}

let timer: ReturnType<typeof setInterval> | undefined;

// Once at start-up and hourly after that. A failed run only logs: the next one
// catches up, and nothing a request depends on waits for it.
export function schedulePurge() {
	if (timer) return;
	const run = () =>
		purgeExpired().catch((err) => console.error('[cleanup] purging expired rows failed', err));
	void run();
	timer = setInterval(run, HOUR);
	timer.unref?.();
}
