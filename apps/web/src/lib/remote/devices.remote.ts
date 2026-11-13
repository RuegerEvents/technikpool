import { query, command, getRequestEvent } from '$app/server';
import * as v from 'valibot';
import { auth, prisma } from '#lib/server/auth.js';
import { appBaseUrl } from '#lib/server/app-url.js';
import { requireAuth } from '#lib/server/services/access.js';
import { appError } from '#lib/errors.js';
import { USER_CODE_LENGTH, normalizeUserCode } from '#lib/device-code.js';

export const getPairingInfo = query(async () => {
	await requireAuth();
	return { baseUrl: appBaseUrl };
});

const userCodeSchema = v.object({
	// Displayed grouped as ABCD-EFGH; the server matches on the bare characters.
	// A shorter string cannot be a code, so it is refused rather than looked up.
	userCode: v.pipe(
		v.string(),
		v.transform(normalizeUserCode),
		v.length(USER_CODE_LENGTH, 'Enter the code shown on the device')
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

/**
 * Better-auth's device errors carry `error` / `error_description` and no message, so
 * thrown as they are they reach the page as a bare 500 "Internal Error". A mistyped
 * code is the commonest thing to happen here, so each refusal gets a code of its own.
 */
async function asDeviceError<T>(run: () => Promise<T>): Promise<T> {
	try {
		return await run();
	} catch (err) {
		const body = (err as { body?: { error?: unknown; error_description?: unknown } }).body;
		const kind = body?.error;
		const description = String(body?.error_description ?? '');
		if (kind === 'expired_token') appError(410, 'device_code_expired');
		if (/already processed/i.test(description)) appError(409, 'device_code_used');
		if (kind === 'invalid_request') appError(400, 'device_code_invalid');
		if (kind === 'access_denied') appError(403, 'unauthorized');
		throw err;
	}
}

export const approveDevice = command(userCodeSchema, async ({ userCode }) => {
	await requireAuth();
	const event = await getRequestEvent();

	const pending = await asDeviceError(async () => {
		const claimed = await claimCode(userCode);
		await auth.api.deviceApprove({ body: { userCode }, headers: event.request.headers });
		return claimed;
	});

	return { clientId: pending.client_id ?? null };
});

export const denyDevice = command(userCodeSchema, async ({ userCode }) => {
	await requireAuth();
	const event = await getRequestEvent();

	await asDeviceError(async () => {
		await claimCode(userCode);
		await auth.api.deviceDeny({ body: { userCode }, headers: event.request.headers });
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
	const user = await requireAuth();
	const event = await getRequestEvent();

	// Read directly rather than through auth.api.listSessions, which refuses a session
	// older than a day ("Session is not fresh") and took this whole list down with it.
	const sessions = await prisma.session.findMany({
		where: { userId: user.id, expiresAt: { gt: new Date() } },
		select: {
			id: true,
			userAgent: true,
			ipAddress: true,
			createdAt: true,
			updatedAt: true,
			expiresAt: true
		}
	});
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
		if (session.userId !== user.id) appError(403, 'unauthorized');

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
