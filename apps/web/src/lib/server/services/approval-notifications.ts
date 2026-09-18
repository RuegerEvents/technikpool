import { prisma } from '$lib/server/auth';
import { sendMail } from '$lib/server/mail';
import { appBaseUrl } from '$lib/server/app-url';
import { pendingApprovalEmail } from '$lib/server/emails/pending-approval';

// Loan requests: every path that books another org's unit as PENDING tells
// that org once per batch. Shared by the remote functions that book.

// Returns which of `ownerOrgIds` do NOT currently have any PENDING item in
// this production — i.e. the orgs for which a new PENDING item would be the
// first one, and thus warrants a notification email. Must be called BEFORE
// creating the new items.
export async function getOrgIdsNeedingApprovalNotification(
	productionId: string,
	ownerOrgIds: string[]
) {
	if (ownerOrgIds.length === 0) return [];
	const alreadyPending = await prisma.productionItem.findMany({
		where: {
			productionId,
			status: 'PENDING',
			asset: { organizationId: { in: ownerOrgIds } }
		},
		select: { asset: { select: { organizationId: true } } }
	});
	const alreadyPendingOrgIds = new Set(alreadyPending.map((i) => i.asset.organizationId));
	return ownerOrgIds.filter((id) => !alreadyPendingOrgIds.has(id));
}

// Emails the OWNER/ADMIN members of each owning org once per "batch" of
// approval requests — the caller only passes orgs for which this is the
// first pending item in the production, so the next email only goes out
// once the queue is cleared and refilled.
export async function notifyPendingApproval(
	productionId: string,
	productionName: string,
	requestingOrgName: string,
	ownerOrgIds: string[]
) {
	await Promise.all(
		ownerOrgIds.map(async (ownerOrgId) => {
			try {
				const [pendingCount, org, recipients] = await Promise.all([
					prisma.productionItem.count({
						where: { productionId, status: 'PENDING', asset: { organizationId: ownerOrgId } }
					}),
					prisma.organization.findUniqueOrThrow({
						where: { id: ownerOrgId },
						select: { name: true }
					}),
					prisma.orgMembership.findMany({
						where: { organizationId: ownerOrgId, role: { in: ['OWNER', 'ADMIN'] } },
						include: { user: { select: { email: true, name: true } } }
					})
				]);

				await Promise.all(
					recipients.map((membership) => {
						const { subject, html, text } = pendingApprovalEmail({
							name: membership.user.name,
							ownerOrgName: org.name,
							requestingOrgName,
							productionName,
							pendingCount,
							url: appBaseUrl
						});
						return sendMail({ to: membership.user.email, subject, html, text });
					})
				);
			} catch (err) {
				console.error(`Failed to send pending-approval email for org ${ownerOrgId}:`, err);
			}
		})
	);
}
