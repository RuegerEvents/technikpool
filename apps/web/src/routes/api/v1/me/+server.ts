import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/auth';
import { apiJson, handleApi, requireApiUser, type Schemas } from '$lib/server/api';
import { isSystemAdmin } from '$lib/server/services/access';
import { toOrganization } from '$lib/server/services/api-mappers';

const ORG_SELECT = {
	id: true,
	name: true,
	shortName: true,
	color: true,
	avatarLabel: true
} as const;

export const GET: RequestHandler = ({ locals }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		const admin = await isSystemAdmin(user.id);

		// A system admin can act on every org, so that's what the device should
		// offer them — matching what the web UI shows.
		const organizations = admin
			? await prisma.organization.findMany({ select: ORG_SELECT, orderBy: { name: 'asc' } })
			: (
					await prisma.orgMembership.findMany({
						where: { userId: user.id },
						select: { organization: { select: ORG_SELECT } },
						orderBy: { organization: { name: 'asc' } }
					})
				).map((m) => m.organization);

		const body: Schemas['CurrentUser'] = {
			user: {
				id: user.id,
				email: user.email,
				name: user.name ?? null,
				emailVerified: user.emailVerified,
				image: user.image ?? null
			},
			isAdmin: admin,
			organizations: organizations.map(toOrganization)
		};
		return apiJson('CurrentUser', body);
	});
