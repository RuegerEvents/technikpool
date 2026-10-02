import { prisma } from '#lib/server/auth.js';
import { customerLabel, orgLabel } from '#lib/utils.js';

// Productions an org still has to invoice. Two kinds of billing org:
//
// - the production's own org, billing its customer for everything booked;
// - a lender, billing the production's org for the units it lent and did not
//   lend free of charge (an offer or invoice with scope "LENT").
//
// It is due from the moment the first of those units is handed out, or once
// the production is over, whichever comes first — an invoice is written at
// pickup or after, never at approval. It stops being due when that org has
// sent an invoice for the production, or has dismissed it for good (settled
// outside the app, see BillingDismissal). A cancelled production is not
// billed, and one that ended more than LOOKBACK_DAYS ago is assumed settled:
// everything older than this feature would otherwise land on the list at once.

const LOOKBACK_DAYS = 90;
const BILLED_STATUSES = ['APPROVED', 'CHECKED_OUT', 'RETURNED'];
const HANDED_OUT = ['CHECKED_OUT', 'RETURNED'];

export type BillingTodo = {
	productionId: string;
	productionName: string;
	startDate: Date | null;
	endDate: Date | null;
	/** The org that has to invoice. */
	organizationId: string;
	organizationName: string;
	/** Billing its customer, or the production's org for a loan. */
	side: 'customer' | 'lender';
	/** Who the invoice goes to. */
	recipientName: string | null;
	/** Where "Invoice" leads: a draft invoice, else an offer to convert, else a new offer. */
	draftInvoiceId: string | null;
	offerId: string | null;
};

export async function billingTodos(
	orgIds: string[],
	{ productionId }: { productionId?: string } = {}
): Promise<BillingTodo[]> {
	if (orgIds.length === 0) return [];
	const now = new Date();
	const cutoff = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

	const productions = await prisma.production.findMany({
		where: {
			...(productionId ? { id: productionId } : {}),
			cancelledAt: null,
			OR: [{ endDate: null }, { endDate: { gte: cutoff } }],
			AND: [
				{
					OR: [
						{ organizationId: { in: orgIds } },
						{
							items: {
								some: {
									status: { in: BILLED_STATUSES },
									freeOfCharge: false,
									asset: { organizationId: { in: orgIds } }
								}
							}
						}
					]
				}
			]
		},
		select: {
			id: true,
			name: true,
			startDate: true,
			endDate: true,
			organizationId: true,
			organization: { select: { name: true, shortName: true } },
			customer: { select: { companyName: true, contactPerson: true } },
			items: {
				where: { status: { in: BILLED_STATUSES } },
				select: {
					status: true,
					freeOfCharge: true,
					asset: {
						select: {
							organizationId: true,
							organization: { select: { name: true, shortName: true } }
						}
					}
				}
			},
			invoices: {
				where: { organizationId: { in: orgIds } },
				select: { id: true, organizationId: true, sentAt: true }
			},
			offers: {
				where: { organizationId: { in: orgIds } },
				select: { id: true, organizationId: true, createdAt: true },
				orderBy: { createdAt: 'desc' }
			},
			billingDismissals: {
				where: { organizationId: { in: orgIds } },
				select: { organizationId: true }
			}
		},
		orderBy: [{ endDate: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }]
	});

	const todos: BillingTodo[] = [];
	const over = (p: { endDate: Date | null }) => !!p.endDate && p.endDate < now;

	for (const p of productions) {
		const dismissed = new Set(p.billingDismissals.map((d) => d.organizationId));
		const settled = (orgId: string) =>
			dismissed.has(orgId) || p.invoices.some((i) => i.organizationId === orgId && i.sentAt);
		const todo = (orgId: string, orgName: string, side: BillingTodo['side']) => ({
			productionId: p.id,
			productionName: p.name,
			startDate: p.startDate,
			endDate: p.endDate,
			organizationId: orgId,
			organizationName: orgName,
			side,
			recipientName:
				side === 'lender'
					? orgLabel(p.organization)
					: p.customer
						? customerLabel(p.customer)
						: null,
			draftInvoiceId: p.invoices.find((i) => i.organizationId === orgId && !i.sentAt)?.id ?? null,
			offerId: p.offers.find((o) => o.organizationId === orgId)?.id ?? null
		});

		// The production's own org bills its customer for everything booked.
		if (orgIds.includes(p.organizationId) && p.items.length > 0 && !settled(p.organizationId)) {
			if (over(p) || p.items.some((i) => HANDED_OUT.includes(i.status))) {
				todos.push(todo(p.organizationId, orgLabel(p.organization), 'customer'));
			}
		}

		// Each lender bills the production's org for what it did not lend for free.
		const lenders = new Map<string, typeof p.items>();
		for (const item of p.items) {
			const orgId = item.asset.organizationId;
			if (orgId === p.organizationId || item.freeOfCharge || !orgIds.includes(orgId)) continue;
			const list = lenders.get(orgId);
			if (list) list.push(item);
			else lenders.set(orgId, [item]);
		}
		for (const [orgId, items] of lenders) {
			if (settled(orgId)) continue;
			if (over(p) || items.some((i) => HANDED_OUT.includes(i.status))) {
				todos.push(todo(orgId, orgLabel(items[0].asset.organization), 'lender'));
			}
		}
	}
	return todos;
}
