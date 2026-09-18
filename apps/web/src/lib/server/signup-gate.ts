import { createHash, randomBytes } from 'node:crypto';
import type { prisma } from './auth';

// Who may create an account. Lives outside `services/` and takes the client as
// an argument because `auth.ts` is its first caller: the services import
// `prisma` from there, and a module both sides import at load would be a cycle.
type Db = typeof prisma;

export const INVITATION_TTL_DAYS = 14;

/** A fresh link token and what is stored of it. The token itself is never kept. */
export function newInviteToken() {
	const token = randomBytes(32).toString('base64url');
	return { token, tokenHash: hashInviteToken(token) };
}

export function hashInviteToken(token: string) {
	return createHash('sha256').update(token).digest('hex');
}

export function invitationExpiry(from = new Date()) {
	return new Date(from.getTime() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
}

/** The invitation a link points at, unless it was used, withdrawn or has run out. */
export async function findOpenInvitation(db: Db, token: string | null | undefined) {
	if (!token) return null;
	const invitation = await db.invitation.findUnique({
		where: { tokenHash: hashInviteToken(token) },
		include: {
			organization: { select: { name: true, shortName: true } },
			invitedBy: { select: { name: true } }
		}
	});
	if (!invitation || invitation.acceptedAt || invitation.expiresAt < new Date()) return null;
	return invitation;
}

/**
 * Whether the register form takes someone who has no invitation. An install
 * with no accounts is always open — otherwise nobody could ever get in to
 * flip the switch.
 */
export async function signUpOpen(db: Db) {
	const settings = await db.systemSettings.findUnique({ where: { id: 1 } });
	if (settings?.signUpEnabled) return true;
	return (await db.user.count()) === 0;
}

export type SignUpRefusal = 'SIGNUP_DISABLED' | 'INVITATION_INVALID' | 'INVITATION_EMAIL_MISMATCH';

export const signUpRefusalMessages: Record<SignUpRefusal, string> = {
	SIGNUP_DISABLED: 'Sign-up is by invitation only.',
	INVITATION_INVALID: 'This invitation is no longer valid.',
	INVITATION_EMAIL_MISMATCH: 'This invitation was issued for a different email address.'
};

/**
 * The decision `auth.ts` asks for before a user row is written. An invitation
 * is honoured for the address it was sent to and no other: the link proves the
 * mailbox, which is also why the account it creates starts out verified.
 */
export async function decideSignUp(
	db: Db,
	input: { email: string; token: string | null | undefined }
): Promise<{ allowed: true; invited: boolean } | { allowed: false; reason: SignUpRefusal }> {
	const open = await signUpOpen(db);
	if (!input.token) {
		return open ? { allowed: true, invited: false } : { allowed: false, reason: 'SIGNUP_DISABLED' };
	}
	const invitation = await findOpenInvitation(db, input.token);
	if (!invitation) {
		// A stale link on an open install is just somebody signing up.
		return open
			? { allowed: true, invited: false }
			: { allowed: false, reason: 'INVITATION_INVALID' };
	}
	if (invitation.email !== input.email.toLowerCase()) {
		return { allowed: false, reason: 'INVITATION_EMAIL_MISMATCH' };
	}
	return { allowed: true, invited: true };
}

/**
 * What follows a new account: the first one of an install runs it, and an
 * invited one lands in the org it was invited to.
 */
export async function completeSignUp(
	db: Db,
	input: { userId: string; email: string; token: string | null | undefined }
) {
	if ((await db.user.count()) === 1) {
		await db.user.update({ where: { id: input.userId }, data: { isAdmin: true } });
	}

	const invitation = await findOpenInvitation(db, input.token);
	if (!invitation || invitation.email !== input.email.toLowerCase()) return;

	await db.invitation.update({
		where: { id: invitation.id },
		data: { acceptedAt: new Date() }
	});
	if (invitation.organizationId) {
		await db.orgMembership.upsert({
			where: {
				userId_organizationId: { userId: input.userId, organizationId: invitation.organizationId }
			},
			create: {
				userId: input.userId,
				organizationId: invitation.organizationId,
				role: invitation.role ?? 'MEMBER'
			},
			update: {}
		});
	}
}
