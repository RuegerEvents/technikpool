import { query, command } from '$app/server';
import { prisma } from '#lib/server/auth.js';
import * as v from 'valibot';
import { managedOrgIds, requireAuth, requireOrgInventory } from '#lib/server/services/access.js';
import { billingTodos } from '#lib/server/services/billing-todos.js';
import { orgLabel } from '#lib/utils.js';

// The reminder to invoice a production, and the way to silence it for good.
// Rules in services/billing-todos.ts. Billing is inventory-admin work (see
// `requireOrgBilling` in offers.remote.ts), so these answer to the same rung.

/** Every production the user's orgs still have to invoice. */
export const getBillingTodos = query(async () => {
	const user = await requireAuth();
	return billingTodos(await managedOrgIds(user.id));
});

/** The user's orgs that marked this production as settled outside the app. */
export const getBillingDismissals = query(v.string(), async (productionId: string) => {
	const user = await requireAuth();
	const rows = await prisma.billingDismissal.findMany({
		where: { productionId, organizationId: { in: await managedOrgIds(user.id) } },
		select: {
			organizationId: true,
			createdAt: true,
			organization: { select: { name: true, shortName: true } },
			dismissedBy: { select: { name: true, email: true } }
		}
	});
	return rows.map((row) => ({
		organizationId: row.organizationId,
		organizationName: orgLabel(row.organization),
		createdAt: row.createdAt,
		dismissedBy: row.dismissedBy ? row.dismissedBy.name || row.dismissedBy.email : null
	}));
});

const dismissalSchema = v.object({ productionId: v.string(), organizationId: v.string() });

/** "Settled outside the app": no more reminders for this production and org. */
export const dismissBillingTodo = command(dismissalSchema, async (data) => {
	const user = await requireOrgInventory(data.organizationId, 'billing_manage_forbidden');
	await prisma.billingDismissal.upsert({
		where: {
			productionId_organizationId: {
				productionId: data.productionId,
				organizationId: data.organizationId
			}
		},
		create: { ...data, dismissedById: user.id },
		update: {}
	});
	await Promise.all([
		getBillingTodos().refresh(),
		getBillingDismissals(data.productionId).refresh()
	]);
});

export const restoreBillingTodo = command(dismissalSchema, async (data) => {
	await requireOrgInventory(data.organizationId, 'billing_manage_forbidden');
	await prisma.billingDismissal.deleteMany({
		where: { productionId: data.productionId, organizationId: data.organizationId }
	});
	await Promise.all([
		getBillingTodos().refresh(),
		getBillingDismissals(data.productionId).refresh()
	]);
});
