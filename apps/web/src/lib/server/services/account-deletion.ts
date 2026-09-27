import type { prisma } from '../auth';

type Db = typeof prisma;

// Why an account cannot be deleted right now, if anything stops it. Checked by
// better-auth's `deleteUser.beforeDelete` (someone deleting themselves from the
// profile) and by the admin's `deleteUser` command, so both doors ask the same
// question.
//
// History is no reason: AssetTransaction, CatalogTransaction and the stocktake
// tables null their user on delete (onDelete: SetNull), so the entries stay and
// read "Deleted account". What does block is anything that would leave
// something behind that nobody can manage any more.
export type AccountDeletionBlocker =
	{ code: 'last_org_owner'; orgName: string } | { code: 'last_system_admin' };

// Takes the client as an argument for the same reason signup-gate.ts does:
// auth.ts is a caller, and auth.ts is where `prisma` comes from.
export async function accountDeletionBlocker(
	db: Db,
	userId: string
): Promise<AccountDeletionBlocker | null> {
	const user = await db.user.findUniqueOrThrow({
		where: { id: userId },
		select: { isAdmin: true }
	});
	if (user.isAdmin) {
		const otherAdmins = await db.user.count({ where: { isAdmin: true, id: { not: userId } } });
		if (otherAdmins === 0) return { code: 'last_system_admin' };
	}

	// An org the user owns alone. It doesn't matter whether anyone else is in it:
	// an org without an owner can't be managed or deleted by its members either,
	// so the owner has to hand it over or delete it first.
	const soleOwned = await db.organization.findFirst({
		where: {
			members: { some: { userId, role: 'OWNER' } },
			NOT: { members: { some: { role: 'OWNER', userId: { not: userId } } } }
		},
		select: { name: true }
	});
	if (soleOwned) return { code: 'last_org_owner', orgName: soleOwned.name };

	return null;
}
