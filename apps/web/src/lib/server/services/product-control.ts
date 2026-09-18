import { prisma } from '$lib/server/auth';

export type ProductControl =
	| { allowed: true }
	| { allowed: false; reason: 'foreign_units'; orgNames: string }
	| { allowed: false; reason: 'not_creator' };

/**
 * Whether a user may change what a shared product *is*: its name, manufacturer
 * and category, a picture somebody already gave it, merging it away, deleting it.
 *
 * Whoever's gear it is controls it — every org holding units must be one this
 * user admins. A product nobody holds units of has no such owner, and used to
 * be free for any org admin to fix up; that made every fresh account with an
 * org of its own an editor of the whole unclaimed catalog. It now answers to
 * whoever added it, and to system admins.
 *
 * `managed` is passed in because every caller has already resolved it for its
 * own "is this user an org admin at all" check.
 */
export async function productControl(
	user: { id: string; systemAdmin: boolean; managed: string[] },
	product: { id: string; createdById: string | null }
): Promise<ProductControl> {
	if (user.systemAdmin) return { allowed: true };

	const owners = await prisma.asset.findMany({
		where: { productId: product.id },
		select: { organizationId: true },
		distinct: ['organizationId']
	});
	if (owners.length === 0) {
		return product.createdById === user.id
			? { allowed: true }
			: { allowed: false, reason: 'not_creator' };
	}

	const foreign = owners.map((o) => o.organizationId).filter((id) => !user.managed.includes(id));
	if (foreign.length === 0) return { allowed: true };

	const orgs = await prisma.organization.findMany({
		where: { id: { in: foreign } },
		select: { name: true }
	});
	return { allowed: false, reason: 'foreign_units', orgNames: orgs.map((o) => o.name).join(', ') };
}
