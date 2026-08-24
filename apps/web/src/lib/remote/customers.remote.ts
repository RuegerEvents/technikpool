import { query, command } from '$app/server';
import { prisma } from '$lib/server/auth';
import * as v from 'valibot';
import { requireAuth } from '$lib/server/services/access';

async function requireOrgMembership(userId: string, organizationId: string) {
	const membership = await prisma.orgMembership.findUnique({
		where: { userId_organizationId: { userId, organizationId } }
	});
	if (!membership) throw new Error('Not a member');
	return membership;
}

const addressInputSchema = v.object({
	line1: v.string(),
	line2: v.optional(v.string()),
	postalCode: v.string(),
	city: v.string()
});

export const getCustomers = query(v.string(), async (organizationId: string) => {
	const user = await requireAuth();
	await requireOrgMembership(user.id, organizationId);
	return prisma.customer.findMany({
		where: { organizationId },
		include: { address: true },
		orderBy: { createdAt: 'desc' }
	});
});

export const getCustomer = query(v.string(), async (id: string) => {
	const user = await requireAuth();
	const customer = await prisma.customer.findUniqueOrThrow({
		where: { id },
		include: { address: true }
	});
	await requireOrgMembership(user.id, customer.organizationId);
	return customer;
});

function hasAnyAddressValue(address?: {
	line1?: string;
	line2?: string;
	postalCode?: string;
	city?: string;
}) {
	return (
		!!address &&
		Object.values(address).some((v) => (typeof v === 'string' ? v.trim().length > 0 : false))
	);
}

const createCustomerSchema = v.object({
	organizationId: v.string(),
	companyName: v.optional(v.string()),
	contactPerson: v.optional(v.string()),
	email: v.optional(v.string()),
	address: v.optional(addressInputSchema)
});

export const createCustomer = command(createCustomerSchema, async (data) => {
	const user = await requireAuth();
	await requireOrgMembership(user.id, data.organizationId);

	const customer = await prisma.$transaction(async (tx) => {
		const address = hasAnyAddressValue(data.address)
			? await tx.address.create({
					data: {
						line1: data.address!.line1.trim(),
						line2: data.address?.line2?.trim() || null,
						postalCode: data.address!.postalCode.trim(),
						city: data.address!.city.trim()
					}
				})
			: null;

		return tx.customer.create({
			data: {
				organizationId: data.organizationId,
				companyName: data.companyName?.trim() || null,
				contactPerson: data.contactPerson?.trim() || null,
				email: data.email?.trim() || null,
				addressId: address?.id
			},
			include: { address: true }
		});
	});

	await getCustomers(data.organizationId).refresh();
	return customer;
});

const updateCustomerSchema = v.object({
	customerId: v.string(),
	companyName: v.optional(v.string()),
	contactPerson: v.optional(v.string()),
	email: v.optional(v.string()),
	address: v.optional(addressInputSchema)
});

export const updateCustomer = command(updateCustomerSchema, async (input) => {
	const user = await requireAuth();
	const customer = await prisma.customer.findUniqueOrThrow({ where: { id: input.customerId } });
	await requireOrgMembership(user.id, customer.organizationId);

	const updated = await prisma.$transaction(async (tx) => {
		let addressId = customer.addressId;
		if (input.address) {
			if (!hasAnyAddressValue(input.address)) {
				addressId = null;
			} else if (customer.addressId) {
				await tx.address.update({
					where: { id: customer.addressId },
					data: {
						line1: input.address.line1.trim(),
						line2: input.address.line2?.trim() || null,
						postalCode: input.address.postalCode.trim(),
						city: input.address.city.trim()
					}
				});
			} else {
				const created = await tx.address.create({
					data: {
						line1: input.address.line1.trim(),
						line2: input.address.line2?.trim() || null,
						postalCode: input.address.postalCode.trim(),
						city: input.address.city.trim()
					}
				});
				addressId = created.id;
			}
		}

		return tx.customer.update({
			where: { id: input.customerId },
			data: {
				companyName: input.companyName?.trim() || null,
				contactPerson: input.contactPerson?.trim() || null,
				email: input.email?.trim() || null,
				addressId
			},
			include: { address: true }
		});
	});

	await getCustomers(customer.organizationId).refresh();
	await getCustomer(input.customerId).refresh();
	return updated;
});
