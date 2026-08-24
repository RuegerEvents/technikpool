import { query, command, getRequestEvent } from '$app/server';
import { prisma } from '$lib/server/auth';
import { sendMail } from '$lib/server/mail';
import { appBaseUrl } from '$lib/server/app-url';
import { addedToOrgEmail } from '$lib/server/emails/added-to-org';
import * as v from 'valibot';

async function requireAuth() {
	const event = await getRequestEvent();
	if (!event?.locals.user) {
		throw new Error('Unauthorized');
	}
	return event.locals.user;
}

async function isUserAdmin(userId: string) {
	const u = await prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } });
	return u?.isAdmin ?? false;
}

async function requireOrgManageAccess(orgId: string) {
	const user = await requireAuth();
	if (await isUserAdmin(user.id)) return user;
	const membership = await prisma.orgMembership.findUnique({
		where: { userId_organizationId: { userId: user.id, organizationId: orgId } }
	});
	if (membership?.role !== 'OWNER') {
		throw new Error('Only org owners or system admins can manage this organization');
	}
	return user;
}

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
		throw new Error('Not a member of this organization');
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
	const admin = await isUserAdmin(user.id);
	if (!admin) {
		const m = await prisma.orgMembership.findUnique({
			where: { userId_organizationId: { userId: user.id, organizationId: orgId } }
		});
		if (!m) throw new Error('Not a member of this organization');
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
		await requireOrgManageAccess(orgId);
		const target = await prisma.user.findUnique({ where: { email } });
		if (!target) throw new Error('No user found with that email');

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
	}
);

export const removeUserFromOrg = command(
	v.object({ orgId: v.string(), userId: v.string() }),
	async ({ orgId, userId }) => {
		const current = await requireOrgManageAccess(orgId);
		if (userId === current.id) throw new Error('Cannot remove yourself from the organization');
		await prisma.orgMembership.delete({
			where: { userId_organizationId: { userId, organizationId: orgId } }
		});
		await getOrgWithMembers(orgId).refresh();
	}
);

export const updateMemberRole = command(
	v.object({ orgId: v.string(), userId: v.string(), role: roleSchema }),
	async ({ orgId, userId, role }) => {
		await requireOrgManageAccess(orgId);
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
	if (prefix.length !== 3) throw new Error('Asset ID prefix must be exactly 3 digits');
	return prefix;
}

function normalizeAvatarLabel(raw: string): string {
	const label = raw
		.trim()
		.toUpperCase()
		.replace(/[^A-Z]/g, '')
		.slice(0, 2);
	if (label.length !== 2) throw new Error('Avatar label must be exactly 2 letters');
	return label;
}

function normalizeColor(raw: string): string {
	const color = raw.trim();
	if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
		throw new Error('Color must be a #RRGGBB hex value');
	}
	return color.toLowerCase();
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
		const user = await requireAuth();
		const prefix = normalizePrefix(assetIdPrefix);
		const normalizedColor = normalizeColor(color);
		const normalizedLabel = normalizeAvatarLabel(avatarLabel);

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
	bankName: v.optional(v.nullable(v.string()))
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
		bankName
	}) => {
		await requireOrgManageAccess(orgId);
		const prefix = normalizePrefix(assetIdPrefix);
		const normalizedColor = normalizeColor(color);
		const normalizedLabel = normalizeAvatarLabel(avatarLabel);

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
					...(bankName !== undefined ? { bankName } : {})
				}
			});
		});

		await getOrgWithMembers(orgId).refresh();
		await getMyOrgs().refresh();
		return org;
	}
);

// ── Admin-only ────────────────────────────────────────────────────────────────

export const getAllOrgs = query(async () => {
	const user = await requireAuth();
	if (!(await isUserAdmin(user.id))) throw new Error('Admin access required');

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
	if (!(await isUserAdmin(user.id))) throw new Error('Admin access required');
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
		if (!(await isUserAdmin(current.id))) throw new Error('Admin access required');
		if (userId === current.id) throw new Error('Cannot change your own admin status');
		await prisma.user.update({ where: { id: userId }, data: { isAdmin } });
		await getAllUsers().refresh();
	}
);

// ── Category rental rates (offers/invoices pricing, issue #9) ─────────────────

export const getOrgCategoryRates = query(v.string(), async (orgId: string) => {
	await requireOrgManageAccess(orgId);
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
		await requireOrgManageAccess(orgId);
		await prisma.orgCategoryRate.upsert({
			where: { organizationId_categoryId: { organizationId: orgId, categoryId } },
			create: { organizationId: orgId, categoryId, percentage },
			update: { percentage }
		});
		await getOrgCategoryRates(orgId).refresh();
	}
);
