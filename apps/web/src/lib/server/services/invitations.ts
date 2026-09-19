import { prisma } from '$lib/server/auth';
import { sendMail } from '$lib/server/mail';
import { appBaseUrl } from '$lib/server/app-url';
import { invitationEmail } from '$lib/server/emails/invitation';
import { invitationExpiry, newInviteToken } from '$lib/server/signup-gate';
import { DEFAULT_ORG_ROLE, type OrgRole } from '$lib/roles';

/**
 * Invite one address, replacing whatever invitation to the same place was
 * still open — a second link for the same seat would only be a second
 * credential to lose track of.
 *
 * Hands the link back because only its hash is stored: this is the one moment
 * it can be shown, and an inviter whose mail did not go out (`mailed: false`)
 * needs it to pass on by hand.
 */
export async function issueInvitation(input: {
	email: string;
	invitedBy: { id: string; name?: string | null };
	organizationId?: string | null;
	role?: OrgRole | null;
}) {
	const email = input.email.trim().toLowerCase();
	const organizationId = input.organizationId ?? null;
	const { token, tokenHash } = newInviteToken();

	const invitation = await prisma.$transaction(async (tx) => {
		await tx.invitation.deleteMany({ where: { email, organizationId, acceptedAt: null } });
		return tx.invitation.create({
			data: {
				email,
				tokenHash,
				invitedById: input.invitedBy.id,
				organizationId,
				role: organizationId ? (input.role ?? DEFAULT_ORG_ROLE) : null,
				expiresAt: invitationExpiry()
			},
			include: { organization: { select: { name: true } } }
		});
	});

	const url = `${appBaseUrl}/auth/register?invite=${token}`;
	let mailed = true;
	try {
		const { subject, html, text } = invitationEmail({
			invitedByName: input.invitedBy.name,
			orgName: invitation.organization?.name,
			role: invitation.role,
			url,
			expiresAt: invitation.expiresAt
		});
		await sendMail({ to: email, subject, html, text });
	} catch (err) {
		mailed = false;
		console.error(`Failed to send invitation email to ${email}:`, err);
	}

	return { id: invitation.id, email, url, mailed };
}
