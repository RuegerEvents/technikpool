import { prisma } from '#lib/server/auth.js';
import { appError } from '#lib/errors.js';
import { isSystemAdmin, requireOrgInventory } from '#lib/server/services/access.js';

// What members are qualified to inspect (MemberQualification). Kept per org
// membership: the same person can be an Elektrofachkraft in one org and only
// a member in another, because each org answers for its own inspections.

/** Midnight UTC today: a qualification valid until a day still holds on that day. */
function today() {
	const now = new Date();
	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Valid qualifications of one user for one type, by org id. */
export async function validQualifications(userId: string, typeId: string, orgIds: string[]) {
	const rows = await prisma.memberQualification.findMany({
		where: {
			typeId,
			membership: { userId, organizationId: { in: orgIds } },
			OR: [{ validUntil: null }, { validUntil: { gte: today() } }]
		},
		select: { title: true, membership: { select: { organizationId: true } } }
	});
	return new Map(rows.map((r) => [r.membership.organizationId, r.title]));
}

/** The caller's own qualifications in every org, for the inspection dialog. */
export async function myQualifications(userId: string) {
	const rows = await prisma.memberQualification.findMany({
		where: {
			membership: { userId },
			OR: [{ validUntil: null }, { validUntil: { gte: today() } }]
		},
		select: { typeId: true, title: true, membership: { select: { organizationId: true } } }
	});
	return rows.map((r) => ({
		organizationId: r.membership.organizationId,
		typeId: r.typeId,
		title: r.title
	}));
}

/** Every member's qualifications in an org, lapsed ones included, for its member list. */
export async function orgQualifications(userId: string, organizationId: string) {
	if (!(await isSystemAdmin(userId))) {
		const member = await prisma.orgMembership.findUnique({
			where: { userId_organizationId: { userId, organizationId } },
			select: { id: true }
		});
		if (!member) appError(403, 'not_org_member');
	}
	return prisma.memberQualification.findMany({
		where: { membership: { organizationId } },
		select: { membershipId: true, typeId: true, title: true, validUntil: true }
	});
}

export type QualificationInput = {
	membershipId: string;
	typeId: string;
	/** Null or blank removes it. */
	title: string | null;
	/** YYYY-MM-DD, or null for no end date. */
	validUntil: string | null;
};

/** Records, changes or removes what a member is qualified for. ADMIN+ of the member's org. */
export async function setMemberQualification(input: QualificationInput) {
	const membership = await prisma.orgMembership.findUnique({
		where: { id: input.membershipId },
		select: { organizationId: true }
	});
	if (!membership) appError(404, 'member_not_found');
	await requireOrgInventory(membership.organizationId);
	const type = await prisma.inspectionType.findUnique({ where: { id: input.typeId } });
	if (!type) appError(404, 'inspection_type_not_found');

	const key = { membershipId_typeId: { membershipId: input.membershipId, typeId: input.typeId } };
	const title = input.title?.trim();
	if (!title) {
		await prisma.memberQualification.deleteMany({
			where: { membershipId: input.membershipId, typeId: input.typeId }
		});
		return { organizationId: membership.organizationId };
	}
	let validUntil: Date | null = null;
	if (input.validUntil) {
		validUntil = new Date(`${input.validUntil}T00:00:00.000Z`);
		if (Number.isNaN(validUntil.getTime())) appError(400, 'qualification_date_invalid');
	}
	await prisma.memberQualification.upsert({
		where: key,
		create: { membershipId: input.membershipId, typeId: input.typeId, title, validUntil },
		update: { title, validUntil }
	});
	return { organizationId: membership.organizationId };
}
