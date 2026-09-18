import { query } from '$app/server';
import { prisma } from '$lib/server/auth';
import { isSystemAdmin, requireAuth, userOrgIds } from '$lib/server/services/access';
import { orgLabel } from '$lib/utils';

export type KnownAddressKind = 'venue' | 'location' | 'customer' | 'organization';

export type KnownAddress = {
	id: string;
	kind: KnownAddressKind;
	/** Whose address it is: the venue, location, customer or org. May be empty. */
	label: string;
	line1: string;
	line2: string;
	postalCode: string;
	city: string;
};

/**
 * Every address the user's orgs already hold, for the picker in `AddressInput`.
 *
 * Picking one *copies* it into the form. Owners never share an `Address` row:
 * each of them updates its row in place and a deleted customer takes its row
 * along, so a shared one would move a venue whenever a customer did.
 */
export const getKnownAddresses = query(async (): Promise<KnownAddress[]> => {
	const user = await requireAuth();
	// A system admin edits orgs they hold no membership in, and an empty picker
	// there would be the one place the feature silently isn't.
	const orgIds = (await isSystemAdmin(user.id)) ? null : await userOrgIds(user.id);
	const scope = orgIds ? { organizationId: { in: orgIds } } : {};
	const orgScope = orgIds ? { id: { in: orgIds } } : {};

	const [locations, productions, customers, organizations] = await Promise.all([
		prisma.location.findMany({
			where: scope,
			select: { name: true, address: true }
		}),
		prisma.production.findMany({
			where: { ...scope, addressId: { not: null } },
			select: { venueName: true, address: true },
			orderBy: { createdAt: 'desc' }
		}),
		prisma.customer.findMany({
			where: { ...scope, addressId: { not: null } },
			select: { companyName: true, contactPerson: true, address: true }
		}),
		prisma.organization.findMany({
			where: { ...orgScope, addressId: { not: null } },
			select: { name: true, shortName: true, address: true }
		})
	]);

	type Row = { id: string; line1: string; line2: string | null; postalCode: string; city: string };
	const found: KnownAddress[] = [];
	const add = (kind: KnownAddressKind, label: string | null, address: Row | null) => {
		if (!address) return;
		found.push({
			id: address.id,
			kind,
			label: label?.trim() ?? '',
			line1: address.line1,
			line2: address.line2 ?? '',
			postalCode: address.postalCode,
			city: address.city
		});
	};

	// Venues first: a recurring venue is the case this exists for, and the first
	// entry for an address is the one that survives the dedupe below.
	for (const p of productions) add('venue', p.venueName, p.address);
	for (const l of locations) add('location', l.name, l.address);
	for (const c of customers) add('customer', c.companyName || c.contactPerson, c.address);
	for (const o of organizations) add('organization', orgLabel(o), o.address);

	const place = (a: KnownAddress) =>
		[a.line1, a.line2, a.postalCode, a.city].map((s) => s.trim().toLowerCase()).join('|');

	// One entry per (place, label). The same hall booked ten times is one entry;
	// a hall and a customer at the same street are two, because the label is
	// what someone searches by. An unlabelled copy of a labelled place is noise.
	const labelled = new Set(found.filter((a) => a.label).map(place));
	const seen = new Set<string>();
	const unique = found.filter((a) => {
		if (!a.label && labelled.has(place(a))) return false;
		const key = `${place(a)}|${a.label.toLowerCase()}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});

	return unique.sort(
		(a, b) =>
			(a.label || a.line1).localeCompare(b.label || b.line1, 'de') ||
			a.city.localeCompare(b.city, 'de')
	);
});
