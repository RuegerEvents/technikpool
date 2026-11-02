import { query, command } from '$app/server';
import * as v from 'valibot';
import { prisma } from '#lib/server/auth.js';
import { requireOrgInventory, requireOrgWrite } from '#lib/server/services/access.js';
import {
	lenderRentalTerms,
	rentalTermsSettings,
	saveRentalTerms as saveTerms,
	setRentalTermsEnabled as setEnabled
} from '#lib/server/services/rental-terms.js';

// An org's rental terms (Miet-AGB) — see src/lib/server/services/rental-terms.ts.
// Kept and switched like the rest of the billing setup: ADMIN+.

export const getRentalTerms = query(v.string(), async (organizationId: string) => {
	await requireOrgInventory(organizationId, 'billing_manage_forbidden');
	return rentalTermsSettings(organizationId);
});

export const saveRentalTerms = command(
	v.object({ organizationId: v.string(), source: v.string() }),
	async ({ organizationId, source }) => {
		const user = await requireOrgInventory(organizationId, 'billing_manage_forbidden');
		await saveTerms(organizationId, source, user.id);
		await getRentalTerms(organizationId).refresh();
	}
);

export const setRentalTermsEnabled = command(
	v.object({ organizationId: v.string(), enabled: v.boolean() }),
	async ({ organizationId, enabled }) => {
		const user = await requireOrgInventory(organizationId, 'billing_manage_forbidden');
		await setEnabled(organizationId, enabled, user.id);
		await getRentalTerms(organizationId).refresh();
	}
);

/**
 * The lenders' terms a production's noted loans would be requested under, for
 * the request dialog: whoever sends the requests agrees to the ones the
 * production's org has not agreed to yet.
 */
export const getLoanRentalTerms = query(v.string(), async (productionId: string) => {
	const production = await prisma.production.findUniqueOrThrow({
		where: { id: productionId },
		select: { organizationId: true }
	});
	await requireOrgWrite(production.organizationId);
	const drafts = await prisma.productionItem.findMany({
		where: { productionId, status: 'DRAFT' },
		select: { asset: { select: { organizationId: true } } }
	});
	const lenderIds = [...new Set(drafts.map((d) => d.asset.organizationId))];
	return lenderRentalTerms(production.organizationId, lenderIds);
});
