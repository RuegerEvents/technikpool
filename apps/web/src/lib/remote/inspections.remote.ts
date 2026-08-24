import { query, command } from '$app/server';
import { prisma } from '$lib/server/auth';
import * as v from 'valibot';
import { isSystemAdmin, requireAuth, userOrgIds } from '$lib/server/services/access';

const UPCOMING_WINDOW_DAYS = 30;

export const getOverdueAssets = query(async () => {
	const user = await requireAuth();
	const systemAdmin = await isSystemAdmin(user.id);
	const orgIds = systemAdmin ? undefined : await userOrgIds(user.id);

	const now = new Date();
	const upcomingCutoff = new Date(now.getTime() + UPCOMING_WINDOW_DAYS * 86_400_000);

	const assets = await prisma.asset.findMany({
		where: {
			...(orgIds ? { organizationId: { in: orgIds } } : {}),
			nextInspectionDue: { not: null, lte: upcomingCutoff }
		},
		include: {
			product: { include: { manufacturer: true } },
			organization: {
				select: { id: true, name: true, shortName: true, color: true, avatarLabel: true }
			},
			location: { select: { name: true } }
		},
		orderBy: { nextInspectionDue: 'asc' }
	});

	return {
		overdue: assets.filter((a) => a.nextInspectionDue! < now),
		upcoming: assets.filter((a) => a.nextInspectionDue! >= now)
	};
});

export const getOverdueInspectionCount = query(async () => {
	const user = await requireAuth();
	const systemAdmin = await isSystemAdmin(user.id);
	const orgIds = systemAdmin ? undefined : await userOrgIds(user.id);

	return prisma.asset.count({
		where: {
			...(orgIds ? { organizationId: { in: orgIds } } : {}),
			nextInspectionDue: { not: null, lt: new Date() }
		}
	});
});

export const getAssetInspections = query(v.string(), async (assetId: string) => {
	const user = await requireAuth();
	const systemAdmin = await isSystemAdmin(user.id);
	if (!systemAdmin) {
		const asset = await prisma.asset.findUniqueOrThrow({
			where: { id: assetId },
			select: { organizationId: true }
		});
		const orgIds = await userOrgIds(user.id);
		if (!orgIds.includes(asset.organizationId)) throw new Error('Unauthorized');
	}

	return prisma.inspection.findMany({
		where: { assetId },
		orderBy: { performedAt: 'desc' }
	});
});

const logInspectionSchema = v.object({
	assetId: v.string(),
	performedAt: v.string(),
	result: v.picklist(['PASSED', 'FAILED']),
	notes: v.optional(v.string()),
	inspectorName: v.optional(v.string())
});

export const logInspection = command(logInspectionSchema, async (input) => {
	const user = await requireAuth();
	const asset = await prisma.asset.findUniqueOrThrow({ where: { id: input.assetId } });

	const systemAdmin = await isSystemAdmin(user.id);
	if (!systemAdmin) {
		const membership = await prisma.orgMembership.findUnique({
			where: {
				userId_organizationId: { userId: user.id, organizationId: asset.organizationId }
			}
		});
		if (!membership || (membership.role !== 'ADMIN' && membership.role !== 'OWNER')) {
			throw new Error('Unauthorized');
		}
	}

	const performedAt = new Date(input.performedAt);
	const nextDueDate = asset.inspectionIntervalMonths
		? new Date(
				performedAt.getFullYear(),
				performedAt.getMonth() + asset.inspectionIntervalMonths,
				performedAt.getDate()
			)
		: null;

	await prisma.$transaction([
		prisma.inspection.create({
			data: {
				assetId: input.assetId,
				performedAt,
				result: input.result,
				notes: input.notes || null,
				inspectorName: input.inspectorName || null,
				nextDueDate
			}
		}),
		prisma.asset.update({
			where: { id: input.assetId },
			data: { nextInspectionDue: nextDueDate }
		})
	]);

	await getOverdueAssets().refresh();
	await getOverdueInspectionCount().refresh();
	await getAssetInspections(input.assetId).refresh();
});
