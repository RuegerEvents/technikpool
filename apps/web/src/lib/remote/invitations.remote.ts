import { query, command } from '$app/server';
import { prisma } from '$lib/server/auth';
import * as v from 'valibot';
import { ORG_ROLES } from '$lib/roles';
import {
	isSystemAdmin,
	requireAuth,
	requireOrgOwner,
	requireSystemAdmin
} from '$lib/server/services/access';
import { issueInvitation } from '$lib/server/services/invitations';
import { findOpenInvitation, signUpOpen } from '$lib/server/signup-gate';
import { appError } from '$lib/errors';
import { orgLabel } from '$lib/utils';

const roleSchema = v.picklist(ORG_ROLES);

// ── Public: what the login and register pages need before anyone is signed in ──

/** Whether the register form takes someone without an invitation. */
export const getSignUpStatus = query(async () => {
	return { open: await signUpOpen(prisma) };
});

/** What an invitation link is for, so the form can say so and lock the address. */
export const getInvitationPreview = query(v.string(), async (token: string) => {
	const invitation = await findOpenInvitation(prisma, token);
	if (!invitation) return null;
	return {
		email: invitation.email,
		organizationName: invitation.organization ? orgLabel(invitation.organization) : null,
		invitedByName: invitation.invitedBy.name
	};
});

// ── System admin: the switch ─────────────────────────────────────────────────

export const getSignUpSettings = query(async () => {
	await requireSystemAdmin();
	const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });
	return { signUpEnabled: settings?.signUpEnabled ?? false };
});

export const setSignUpEnabled = command(v.boolean(), async (signUpEnabled: boolean) => {
	await requireSystemAdmin();
	await prisma.systemSettings.upsert({
		where: { id: 1 },
		create: { id: 1, signUpEnabled },
		update: { signUpEnabled }
	});
	await Promise.all([getSignUpSettings().refresh(), getSignUpStatus().refresh()]);
});

// ── Invitations ──────────────────────────────────────────────────────────────

/**
 * Open invitations: one org's for its owner, all of them for a system admin.
 * Accepted ones are left out — the account they became is in the member list.
 */
export const getInvitations = query(v.optional(v.string()), async (organizationId?: string) => {
	if (organizationId) await requireOrgOwner(organizationId);
	else await requireSystemAdmin();

	const invitations = await prisma.invitation.findMany({
		where: { acceptedAt: null, ...(organizationId ? { organizationId } : {}) },
		select: {
			id: true,
			email: true,
			role: true,
			expiresAt: true,
			createdAt: true,
			organization: { select: { id: true, name: true, shortName: true } },
			invitedBy: { select: { name: true, email: true } }
		},
		orderBy: { createdAt: 'desc' }
	});
	const now = new Date();
	return invitations.map((invitation) => ({ ...invitation, expired: invitation.expiresAt < now }));
});

/**
 * Invite an address to the platform, optionally straight into an org. Someone
 * who already has an account is not invited again — adding them to an org is
 * `addUserToOrg`'s job, which also falls back to this for an unknown address.
 */
export const inviteUser = command(
	v.object({
		email: v.pipe(v.string(), v.trim(), v.email()),
		organizationId: v.optional(v.string()),
		role: v.optional(roleSchema)
	}),
	async ({ email, organizationId, role }) => {
		const user = organizationId
			? await requireOrgOwner(organizationId)
			: await requireSystemAdmin();

		const existing = await prisma.user.findUnique({
			where: { email: email.toLowerCase() },
			select: { id: true }
		});
		if (existing) appError(409, 'invite_user_exists', [email]);

		const result = await issueInvitation({ email, invitedBy: user, organizationId, role });
		await refreshInvitations(organizationId);
		return result;
	}
);

/** A new link for the same seat. The old one stops working, which is the point of asking. */
export const resendInvitation = command(v.string(), async (invitationId: string) => {
	const user = await requireAuth();
	const invitation = await prisma.invitation.findUnique({ where: { id: invitationId } });
	if (!invitation || invitation.acceptedAt) appError(404, 'invitation_not_found');
	if (invitation.organizationId) await requireOrgOwner(invitation.organizationId);
	else await requireSystemAdmin();

	const result = await issueInvitation({
		email: invitation.email,
		invitedBy: user,
		organizationId: invitation.organizationId,
		role: invitation.role
	});
	await refreshInvitations(invitation.organizationId);
	return result;
});

export const revokeInvitation = command(v.string(), async (invitationId: string) => {
	const invitation = await prisma.invitation.findUnique({ where: { id: invitationId } });
	if (!invitation || invitation.acceptedAt) appError(404, 'invitation_not_found');
	if (invitation.organizationId) await requireOrgOwner(invitation.organizationId);
	else await requireSystemAdmin();

	await prisma.invitation.delete({ where: { id: invitationId } });
	await refreshInvitations(invitation.organizationId);
});

/**
 * The org's own list, and the system-wide one for whoever can see it. An org
 * owner cannot, and refreshing a query the caller may not read fails a command
 * whose write has already gone through.
 */
async function refreshInvitations(organizationId?: string | null) {
	const user = await requireAuth();
	const admin = await isSystemAdmin(user.id);
	await Promise.all([
		...(organizationId ? [getInvitations(organizationId).refresh()] : []),
		...(admin ? [getInvitations().refresh()] : [])
	]);
}
