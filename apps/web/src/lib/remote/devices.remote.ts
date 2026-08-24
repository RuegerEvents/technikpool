import { query, command, getRequestEvent } from '$app/server';
import * as v from 'valibot';
import { auth, prisma } from '$lib/server/auth';
import { appBaseUrl } from '$lib/server/app-url';
import { requireAuth } from '$lib/server/services/access';

export const getPairingInfo = query(async () => {
	await requireAuth();
	return { baseUrl: appBaseUrl };
});

const userCodeSchema = v.object({
	// Displayed grouped as ABCD-EFGH; the server matches on the bare characters.
	userCode: v.pipe(
		v.string(),
		v.transform((s) => s.replace(/[\s-]/g, '').toUpperCase()),
		v.minLength(4, 'Enter the code shown on the device')
	)
});

/**
 * Approving is two steps: the session must first claim the code via
 * GET /device?user_code=..., which is what binds the pending request to this
 * user, and only then may it approve. Calling approve alone is rejected.
 */
async function claimCode(userCode: string) {
	const event = await getRequestEvent();
	const headers = event.request.headers;
	return await auth.api.deviceVerify({ query: { user_code: userCode }, headers });
}

export const approveDevice = command(userCodeSchema, async ({ userCode }) => {
	await requireAuth();
	const event = await getRequestEvent();

	const pending = await claimCode(userCode);
	await auth.api.deviceApprove({
		body: { userCode },
		headers: event.request.headers
	});

	return { clientId: pending.client_id ?? null };
});

export const denyDevice = command(userCodeSchema, async ({ userCode }) => {
	await requireAuth();
	const event = await getRequestEvent();

	await claimCode(userCode);
	await auth.api.deviceDeny({
		body: { userCode },
		headers: event.request.headers
	});

	return { ok: true };
});

// ── Connected devices ────────────────────────────────────────────────────────

/**
 * What the scanner app puts in its User-Agent. Set in `ApiClient` over in
 * apps/scanner — keep the two in step, it is the only thing that tells a
 * handheld's session apart from a browser's.
 */
const SCANNER_UA_PREFIX = 'Technikpool-Scanner';

type DeviceKind = 'scanner' | 'browser';

/**
 * A session's User-Agent, reduced to something worth showing next to a
 * Disconnect button. Scanners identify themselves exactly; for everything else
 * this is a best guess at browser and platform, which is enough to recognise
 * "the laptop" without pretending to be a UA parsing library.
 */
function describeUserAgent(ua: string | null | undefined): { kind: DeviceKind; label: string } {
	if (!ua) return { kind: 'browser', label: 'Unknown device' };

	if (ua.startsWith(SCANNER_UA_PREFIX)) {
		// "Technikpool-Scanner (Android; Chainway C90)" → "Chainway C90"
		const detail = ua.match(/\(([^)]*)\)/)?.[1] ?? '';
		const model = detail.split(';').at(-1)?.trim();
		return { kind: 'scanner', label: model || 'Handheld scanner' };
	}

	// Order matters: Edge and Opera also claim Chrome, and Chrome claims Safari.
	const browser = /\bEdg\//.test(ua)
		? 'Edge'
		: /\bOPR\//.test(ua)
			? 'Opera'
			: /\bFirefox\//.test(ua)
				? 'Firefox'
				: /\bChrome\//.test(ua)
					? 'Chrome'
					: /\bSafari\//.test(ua)
						? 'Safari'
						: null;

	const platform = /\bWindows\b/.test(ua)
		? 'Windows'
		: /\b(iPhone|iPad|iPod)\b/.test(ua)
			? 'iOS'
			: /\bMac OS X\b/.test(ua)
				? 'macOS'
				: /\bAndroid\b/.test(ua)
					? 'Android'
					: /\bLinux\b/.test(ua)
						? 'Linux'
						: null;

	if (browser && platform) return { kind: 'browser', label: `${browser} on ${platform}` };
	return { kind: 'browser', label: browser ?? platform ?? 'Unknown device' };
}

export const getConnectedDevices = query(async () => {
	await requireAuth();
	const event = await getRequestEvent();

	const sessions = await auth.api.listSessions({ headers: event.request.headers });
	const currentId = event.locals.session?.id ?? null;

	// The session token is a bearer credential — it never leaves the server.
	// Disconnecting goes by id, which is meaningless to anyone who steals it.
	return (
		sessions
			.map((session) => ({
				id: session.id,
				...describeUserAgent(session.userAgent),
				ipAddress: session.ipAddress ?? null,
				connectedAt: session.createdAt,
				lastSeenAt: session.updatedAt,
				expiresAt: session.expiresAt,
				current: session.id === currentId
			}))
			// Scanners first — this list hangs under the pairing steps, and they are
			// what someone came here to manage.
			.sort((a, b) => {
				if (a.kind !== b.kind) return a.kind === 'scanner' ? -1 : 1;
				return b.lastSeenAt.getTime() - a.lastSeenAt.getTime();
			})
	);
});

export const disconnectDevice = command(
	v.object({ sessionId: v.string() }),
	async ({ sessionId }) => {
		const user = await requireAuth();
		const event = await getRequestEvent();

		const session = await prisma.session.findUniqueOrThrow({
			where: { id: sessionId },
			select: { userId: true, token: true }
		});
		if (session.userId !== user.id) throw new Error('Unauthorized');

		// Go through better-auth rather than deleting the row, so anything it keeps
		// alongside the record goes with it.
		await auth.api.revokeSession({
			body: { token: session.token },
			headers: event.request.headers
		});

		await getConnectedDevices().refresh();
		return { ok: true };
	}
);
