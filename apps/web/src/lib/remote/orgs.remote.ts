import { query, command } from '$app/server';
import { prisma } from '$lib/server/auth';
import { sendMail } from '$lib/server/mail';
import { appBaseUrl } from '$lib/server/app-url';
import { addedToOrgEmail } from '$lib/server/emails/added-to-org';
import * as v from 'valibot';
import { isSystemAdmin, requireAuth, requireOrgOwner } from '$lib/server/services/access';
import { appError } from '$lib/errors';
import { issueInvitation } from '$lib/server/services/invitations';
import { getInvitations } from './invitations.remote';

export const getMyOrgs = query(async () => {
	const user = await requireAuth();

	const memberships = await prisma.orgMembership.findMany({
		where: { userId: user.id },
		include: { organization: true }
	});

	return memberships.map((m) => ({
		...m.organization,
		role: m.role
	}));
});

export const getOrg = query(v.string(), async (orgId: string) => {
	const user = await requireAuth();

	const membership = await prisma.orgMembership.findUnique({
		where: {
			userId_organizationId: {
				userId: user.id,
				organizationId: orgId
			}
		},
		include: { organization: true }
	});

	if (!membership) {
		appError(403, 'not_org_member');
	}

	return membership.organization;
});

export const getOrgUsers = query(async () => {
	const user = await requireAuth();

	const memberships = await prisma.orgMembership.findMany({
		where: { userId: user.id },
		select: { organizationId: true }
	});
	const orgIds = memberships.map((m) => m.organizationId);

	const orgMembers = await prisma.orgMembership.findMany({
		where: { organizationId: { in: orgIds } },
		include: { user: { select: { id: true, name: true, email: true } } },
		distinct: ['userId']
	});

	return orgMembers.map((m) => m.user);
});

export const getOrgWithMembers = query(v.string(), async (orgId: string) => {
	const user = await requireAuth();
	const admin = await isSystemAdmin(user.id);
	if (!admin) {
		const m = await prisma.orgMembership.findUnique({
			where: { userId_organizationId: { userId: user.id, organizationId: orgId } }
		});
		if (!m) appError(403, 'not_org_member');
	}
	return prisma.organization.findUniqueOrThrow({
		where: { id: orgId },
		include: {
			address: true,
			members: {
				include: {
					user: { select: { id: true, name: true, email: true, isAdmin: true } }
				},
				orderBy: { role: 'asc' }
			}
		}
	});
});

const roleSchema = v.picklist(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']);

export const addUserToOrg = command(
	v.object({ orgId: v.string(), email: v.string(), role: roleSchema }),
	async ({ orgId, email, role }) => {
		const current = await requireOrgOwner(orgId);
		const target = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
		if (!target) {
			// Nobody by that address yet: with sign-up closed they could not get
			// one either, so the owner's "add" becomes an invitation into this org.
			const invitation = await issueInvitation({
				email,
				invitedBy: current,
				organizationId: orgId,
				role
			});
			await getInvitations(orgId).refresh();
			if (await isSystemAdmin(current.id)) await getInvitations().refresh();
			return { status: 'invited' as const, url: invitation.url, mailed: invitation.mailed };
		}

		const existing = await prisma.orgMembership.findUnique({
			where: { userId_organizationId: { userId: target.id, organizationId: orgId } }
		});

		await prisma.orgMembership.upsert({
			where: { userId_organizationId: { userId: target.id, organizationId: orgId } },
			create: { userId: target.id, organizationId: orgId, role },
			update: { role }
		});

		if (!existing) {
			try {
				const org = await prisma.organization.findUniqueOrThrow({
					where: { id: orgId },
					select: { name: true }
				});
				const { subject, html, text } = addedToOrgEmail({
					name: target.name,
					orgName: org.name,
					role,
					url: appBaseUrl
				});
				await sendMail({ to: target.email, subject, html, text });
			} catch (err) {
				console.error(`Failed to send added-to-org email for org ${orgId}:`, err);
			}
		}

		await getOrgWithMembers(orgId).refresh();
		return { status: 'added' as const };
	}
);

export const removeUserFromOrg = command(
	v.object({ orgId: v.string(), userId: v.string() }),
	async ({ orgId, userId }) => {
		const current = await requireOrgOwner(orgId);
		if (userId === current.id) appError(409, 'cannot_remove_self');
		await prisma.orgMembership.delete({
			where: { userId_organizationId: { userId, organizationId: orgId } }
		});
		await getOrgWithMembers(orgId).refresh();
	}
);

export const updateMemberRole = command(
	v.object({ orgId: v.string(), userId: v.string(), role: roleSchema }),
	async ({ orgId, userId, role }) => {
		await requireOrgOwner(orgId);
		await prisma.orgMembership.update({
			where: { userId_organizationId: { userId, organizationId: orgId } },
			data: { role }
		});
		await getOrgWithMembers(orgId).refresh();
	}
);

function normalizePrefix(raw: string): string {
	const prefix = raw
		.trim()
		.replace(/[^0-9]/g, '')
		.slice(0, 3);
	if (prefix.length !== 3) appError(400, 'org_prefix_invalid');
	return prefix;
}

function normalizeAvatarLabel(raw: string): string {
	const label = raw
		.trim()
		.toUpperCase()
		.replace(/[^A-Z]/g, '')
		.slice(0, 2);
	if (label.length !== 2) appError(400, 'org_avatar_label_invalid');
	return label;
}

function normalizeColor(raw: string): string {
	const color = raw.trim();
	if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
		appError(400, 'org_color_invalid');
	}
	return color.toLowerCase();
}

/**
 * Colour, avatar label and asset-ID prefix are globally unique, so the create/edit forms need to
 * know what is already spoken for. Names are only included for orgs the caller can already see —
 * the identity values themselves are harmless, an org's name is not.
 */
export const getOrgIdentityInUse = query(async () => {
	const user = await requireAuth();
	const admin = await isSystemAdmin(user.id);
	const visible = admin
		? null
		: new Set(
				(
					await prisma.orgMembership.findMany({
						where: { userId: user.id },
						select: { organizationId: true }
					})
				).map((m) => m.organizationId)
			);

	const orgs = await prisma.organization.findMany({
		select: {
			id: true,
			name: true,
			shortName: true,
			color: true,
			avatarLabel: true,
			assetIdPrefix: true
		},
		orderBy: { name: 'asc' }
	});

	return orgs.map((org) => ({
		id: org.id,
		color: org.color,
		avatarLabel: org.avatarLabel,
		assetIdPrefix: org.assetIdPrefix,
		name: !visible || visible.has(org.id) ? org.shortName || org.name : null
	}));
});

/**
 * Turns the three unique constraints into readable 409s. Without this the duplicate lands as a
 * raw Prisma P2002 and the client only ever sees "Internal Error".
 */
async function assertOrgIdentityFree(
	identity: { color: string; avatarLabel: string; assetIdPrefix: string },
	exceptOrgId?: string
) {
	const clashes = await prisma.organization.findMany({
		where: {
			...(exceptOrgId ? { id: { not: exceptOrgId } } : {}),
			OR: [
				{ color: identity.color },
				{ avatarLabel: identity.avatarLabel },
				{ assetIdPrefix: identity.assetIdPrefix }
			]
		},
		select: { color: true, avatarLabel: true, assetIdPrefix: true }
	});
	if (clashes.some((o) => o.color === identity.color)) {
		appError(409, 'org_color_taken', [identity.color]);
	}
	if (clashes.some((o) => o.avatarLabel === identity.avatarLabel)) {
		appError(409, 'org_avatar_label_taken', [identity.avatarLabel]);
	}
	if (clashes.some((o) => o.assetIdPrefix === identity.assetIdPrefix)) {
		appError(409, 'org_prefix_taken', [identity.assetIdPrefix]);
	}
}

const createOrgSchema = v.object({
	name: v.string(),
	shortName: v.optional(v.string()),
	assetIdPrefix: v.string(),
	color: v.string(),
	avatarLabel: v.string()
});

export const createOrg = command(
	createOrgSchema,
	async ({ name, shortName, assetIdPrefix, color, avatarLabel }) => {
		// An org is what makes someone an admin of anything, and org admins write
		// to the shared catalog — so handing them out is the instance's decision.
		// The creator still becomes OWNER, as the first member.
		const user = await requireAuth();
		if (!(await isSystemAdmin(user.id))) appError(403, 'org_create_forbidden');
		const prefix = normalizePrefix(assetIdPrefix);
		const normalizedColor = normalizeColor(color);
		const normalizedLabel = normalizeAvatarLabel(avatarLabel);
		await assertOrgIdentityFree({
			color: normalizedColor,
			avatarLabel: normalizedLabel,
			assetIdPrefix: prefix
		});

		const org = await prisma.$transaction(async (tx) => {
			return await tx.organization.create({
				data: {
					name,
					shortName: shortName?.trim() || null,
					assetIdPrefix: prefix,
					color: normalizedColor,
					avatarLabel: normalizedLabel,
					members: {
						create: {
							userId: user.id,
							role: 'OWNER'
						}
					}
				}
			});
		});

		await getMyOrgs().refresh();
		if (await isSystemAdmin(user.id)) await getAllOrgs().refresh();
		await getOrgIdentityInUse().refresh();
		return org;
	}
);

const billingAddressSchema = v.object({
	line1: v.string(),
	line2: v.optional(v.string()),
	postalCode: v.string(),
	city: v.string()
});

const updateOrgSchema = v.object({
	orgId: v.string(),
	shortName: v.optional(v.nullable(v.string())),
	assetIdPrefix: v.string(),
	color: v.string(),
	avatarLabel: v.string(),
	defaultInspectionIntervalMonths: v.optional(v.nullable(v.number())),
	isKleinunternehmer: v.optional(v.boolean()),
	address: v.optional(v.nullable(billingAddressSchema)),
	taxId: v.optional(v.nullable(v.string())),
	bankAccountHolder: v.optional(v.nullable(v.string())),
	iban: v.optional(v.nullable(v.string())),
	bic: v.optional(v.nullable(v.string())),
	bankName: v.optional(v.nullable(v.string())),
	billingEmail: v.optional(v.nullable(v.string())),
	billingWebsite: v.optional(v.nullable(v.string())),
	paymentTermsDays: v.optional(v.number()),
	offerIntroTemplate: v.optional(v.nullable(v.string())),
	offerClosingTemplate: v.optional(v.nullable(v.string())),
	invoiceIntroTemplate: v.optional(v.nullable(v.string())),
	invoiceClosingTemplate: v.optional(v.nullable(v.string()))
});

export const updateOrg = command(
	updateOrgSchema,
	async ({
		orgId,
		shortName,
		assetIdPrefix,
		color,
		avatarLabel,
		defaultInspectionIntervalMonths,
		isKleinunternehmer,
		address,
		taxId,
		bankAccountHolder,
		iban,
		bic,
		bankName,
		billingEmail,
		billingWebsite,
		paymentTermsDays,
		offerIntroTemplate,
		offerClosingTemplate,
		invoiceIntroTemplate,
		invoiceClosingTemplate
	}) => {
		await requireOrgOwner(orgId);
		const prefix = normalizePrefix(assetIdPrefix);
		const normalizedColor = normalizeColor(color);
		const normalizedLabel = normalizeAvatarLabel(avatarLabel);
		await assertOrgIdentityFree(
			{ color: normalizedColor, avatarLabel: normalizedLabel, assetIdPrefix: prefix },
			orgId
		);

		const org = await prisma.$transaction(async (tx) => {
			let addressId: string | null | undefined = undefined;
			if (address !== undefined) {
				if (address === null) {
					addressId = null;
				} else {
					const current = await tx.organization.findUniqueOrThrow({
						where: { id: orgId },
						select: { addressId: true }
					});
					const addressData = {
						line1: address.line1.trim(),
						line2: address.line2?.trim() || null,
						postalCode: address.postalCode.trim(),
						city: address.city.trim()
					};
					if (current.addressId) {
						await tx.address.update({ where: { id: current.addressId }, data: addressData });
						addressId = current.addressId;
					} else {
						const created = await tx.address.create({ data: addressData });
						addressId = created.id;
					}
				}
			}

			return await tx.organization.update({
				where: { id: orgId },
				data: {
					...(shortName !== undefined ? { shortName: shortName?.trim() || null } : {}),
					assetIdPrefix: prefix,
					color: normalizedColor,
					avatarLabel: normalizedLabel,
					...(defaultInspectionIntervalMonths !== undefined
						? { defaultInspectionIntervalMonths }
						: {}),
					...(isKleinunternehmer !== undefined ? { isKleinunternehmer } : {}),
					...(addressId !== undefined ? { addressId } : {}),
					...(taxId !== undefined ? { taxId } : {}),
					...(bankAccountHolder !== undefined ? { bankAccountHolder } : {}),
					...(iban !== undefined ? { iban } : {}),
					...(bic !== undefined ? { bic } : {}),
					...(bankName !== undefined ? { bankName } : {}),
					...(billingEmail !== undefined ? { billingEmail: billingEmail?.trim() || null } : {}),
					...(billingWebsite !== undefined
						? { billingWebsite: billingWebsite?.trim() || null }
						: {}),
					...(paymentTermsDays !== undefined ? { paymentTermsDays } : {}),
					...(offerIntroTemplate !== undefined
						? { offerIntroTemplate: offerIntroTemplate?.trim() || null }
						: {}),
					...(offerClosingTemplate !== undefined
						? { offerClosingTemplate: offerClosingTemplate?.trim() || null }
						: {}),
					...(invoiceIntroTemplate !== undefined
						? { invoiceIntroTemplate: invoiceIntroTemplate?.trim() || null }
						: {}),
					...(invoiceClosingTemplate !== undefined
						? { invoiceClosingTemplate: invoiceClosingTemplate?.trim() || null }
						: {})
				}
			});
		});

		await getOrgWithMembers(orgId).refresh();
		await getMyOrgs().refresh();
		await getOrgIdentityInUse().refresh();
		return org;
	}
);

export const deleteOrg = command(v.string(), async (orgId: string) => {
	await requireOrgOwner(orgId);
	await prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { id: true } });
	const foreignAssetAtLocation = await prisma.asset.findFirst({
		where: { organizationId: { not: orgId }, location: { organizationId: orgId } },
		select: { id: true }
	});
	if (foreignAssetAtLocation) {
		appError(409, 'location_used_by_other_org');
	}

	await prisma.$transaction(async (tx) => {
		// Production has a restrictive organization FK; its children cascade or
		// detach. Assets must go before their locations and bundles, whose FKs are
		// deliberately restrictive during ordinary inventory operations.
		await tx.production.deleteMany({ where: { organizationId: orgId } });
		await tx.asset.deleteMany({ where: { organizationId: orgId } });
		await tx.user.updateMany({ where: { homeOrgId: orgId }, data: { homeOrgId: null } });
		await tx.organization.delete({ where: { id: orgId } });
	});

	await Promise.all([getMyOrgs().refresh(), getAllOrgs().refresh(), getAllUsers().refresh()]);
	return { id: orgId };
});

// ── Admin-only ────────────────────────────────────────────────────────────────

export const getAllOrgs = query(async () => {
	const user = await requireAuth();
	if (!(await isSystemAdmin(user.id))) appError(403, 'admin_required');

	const orgs = await prisma.organization.findMany({
		include: {
			members: {
				where: { userId: user.id },
				select: { role: true }
			},
			_count: { select: { members: true } }
		},
		orderBy: { name: 'asc' }
	});

	return orgs.map(({ members, _count, ...org }) => ({
		...org,
		role: (members[0]?.role ?? null) as 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER' | null,
		memberCount: _count.members
	}));
});

export const getAllUsers = query(async () => {
	const user = await requireAuth();
	if (!(await isSystemAdmin(user.id))) appError(403, 'admin_required');
	return prisma.user.findMany({
		select: {
			id: true,
			name: true,
			email: true,
			isAdmin: true,
			createdAt: true,
			memberships: {
				select: { role: true, organization: { select: { id: true, name: true, shortName: true } } },
				orderBy: { role: 'asc' }
			}
		},
		orderBy: { createdAt: 'desc' }
	});
});

export const setUserAdmin = command(
	v.object({ userId: v.string(), isAdmin: v.boolean() }),
	async ({ userId, isAdmin }) => {
		const current = await requireAuth();
		if (!(await isSystemAdmin(current.id))) appError(403, 'admin_required');
		if (userId === current.id) appError(409, 'cannot_change_own_admin');
		await prisma.user.update({ where: { id: userId }, data: { isAdmin } });
		await getAllUsers().refresh();
	}
);

export const deleteUser = command(v.string(), async (userId: string) => {
	const current = await requireAuth();
	if (!(await isSystemAdmin(current.id))) appError(403, 'admin_required');
	if (userId === current.id) appError(409, 'cannot_delete_own_account');

	const user = await prisma.user.findUniqueOrThrow({
		where: { id: userId },
		select: { id: true, _count: { select: { transactions: true } } }
	});
	if (user._count.transactions > 0) {
		appError(409, 'user_has_history');
	}

	await prisma.user.delete({ where: { id: userId } });
	await getAllUsers().refresh();
	return { id: userId };
});

// ── Category rental rates (offers/invoices pricing, issue #9) ─────────────────

export const getOrgCategoryRates = query(v.string(), async (orgId: string) => {
	await requireOrgOwner(orgId);
	const [categories, rates] = await Promise.all([
		prisma.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
		prisma.orgCategoryRate.findMany({ where: { organizationId: orgId } })
	]);
	const rateByCategory = new Map(rates.map((r) => [r.categoryId, r]));
	return categories.map((c) => ({
		category: c,
		percentage: rateByCategory.get(c.id)?.percentage.toString() ?? null
	}));
});

const setOrgCategoryRateSchema = v.object({
	orgId: v.string(),
	categoryId: v.string(),
	percentage: v.number()
});

export const setOrgCategoryRate = command(
	setOrgCategoryRateSchema,
	async ({ orgId, categoryId, percentage }) => {
		await requireOrgOwner(orgId);
		await prisma.orgCategoryRate.upsert({
			where: { organizationId_categoryId: { organizationId: orgId, categoryId } },
			create: { organizationId: orgId, categoryId, percentage },
			update: { percentage }
		});
		await getOrgCategoryRates(orgId).refresh();
	}
);
