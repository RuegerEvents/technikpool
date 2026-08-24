import { query, command, getRequestEvent } from '$app/server';
import * as v from 'valibot';
import { auth } from '$lib/server/auth';
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
