import { query, command } from '$app/server';
import * as v from 'valibot';
import { prisma } from '$lib/server/auth';
import { orgRole, requireAuth, requireSystemAdmin } from '$lib/server/services/access';
import { KIND_OF, currentDpa, deliverDpaAcceptances, hashDpa } from '$lib/server/services/legal';
import { LEGAL_SLUGS, type LegalSlug } from '$lib/legal.svelte';
import { appError } from '$lib/errors';
import { formatAddress } from '$lib/utils';
import { getMyOrgs, getOrgWithMembers } from './orgs.remote';
import { getKnownAddresses } from './addresses.remote';

// Editing the operator's legal pages (/admin/legal), and organizations
// accepting the data processing agreement. Reading the pages needs no remote
// function: the links come with the layout data, and /legal/<slug> renders on
// the server.

export const getLegalSettings = query(async () => {
	await requireSystemAdmin();
	const docs = await prisma.legalDocument.findMany();
	return LEGAL_SLUGS.map((slug) => {
		const doc = docs.find((d) => d.kind === KIND_OF[slug]);
		return {
			slug,
			externalUrl: doc?.externalUrl ?? '',
			body: doc?.body ?? '',
			updatedAt: doc?.updatedAt ?? null
		};
	});
});

const nullIfBlank = (s: string) => (s.trim() ? s : null);

export const saveLegalDocument = command(
	v.object({
		slug: v.picklist(LEGAL_SLUGS),
		externalUrl: v.string(),
		body: v.string()
	}),
	async ({ slug, externalUrl, body }: { slug: LegalSlug; externalUrl: string; body: string }) => {
		const user = await requireSystemAdmin();
		// The agreement is text only — see LegalDocumentKind.DPA.
		const url = slug === 'dpa' ? '' : externalUrl.trim();
		if (url && !isHttpUrl(url)) appError(400, 'legal_url_invalid');

		const data = {
			externalUrl: url || null,
			body: nullIfBlank(body),
			updatedById: user.id
		};
		await prisma.legalDocument.upsert({
			where: { kind: KIND_OF[slug] },
			create: { kind: KIND_OF[slug], ...data },
			update: data
		});
		await getLegalSettings().refresh();
		if (slug === 'dpa') await getDpaOverview().refresh();
	}
);

// Every organization and where it stands with the agreement in force: the
// latest acceptance of each, and whether that is of the current text.
export const getDpaOverview = query(async () => {
	await requireSystemAdmin();
	const dpa = await currentDpa();
	const orgs = await prisma.organization.findMany({
		select: {
			id: true,
			name: true,
			dpaAcceptances: {
				orderBy: { acceptedAt: 'desc' },
				take: 1,
				select: { id: true, versionHash: true, userName: true, userEmail: true, acceptedAt: true }
			}
		},
		orderBy: { name: 'asc' }
	});
	return {
		active: !!dpa,
		orgs: orgs.map(({ dpaAcceptances: [latest], ...org }) => ({
			...org,
			latest: latest
				? {
						id: latest.id,
						userName: latest.userName,
						userEmail: latest.userEmail,
						acceptedAt: latest.acceptedAt,
						current: latest.versionHash === dpa?.versionHash
					}
				: null
		}))
	};
});

// An owner accepting the agreement for the organizations they own. The hash is
// the version they were shown: if the text changed while the dialog was open,
// they accepted something else, and are asked again rather than recorded as
// agreeing to text they never saw.
const addressSchema = v.object({
	line1: v.string(),
	line2: v.optional(v.string()),
	postalCode: v.string(),
	city: v.string()
});

export const acceptDpa = command(
	v.object({
		organizationIds: v.array(v.string()),
		versionHash: v.string(),
		// For organizations that have none yet, keyed by id. Saved as the
		// organization's address, which is also its billing address.
		addresses: v.optional(v.record(v.string(), addressSchema))
	}),
	async ({
		organizationIds,
		versionHash,
		addresses = {}
	}: {
		organizationIds: string[];
		versionHash: string;
		addresses?: Record<string, v.InferOutput<typeof addressSchema>>;
	}) => {
		const user = await requireAuth();
		const dpa = await currentDpa();
		if (!dpa || dpa.versionHash !== versionHash) appError(409, 'dpa_outdated');

		const orgs = await prisma.organization.findMany({
			where: { id: { in: organizationIds } },
			select: { id: true, name: true, address: true }
		});
		for (const org of orgs) {
			if ((await orgRole(user.id, org.id)) !== 'OWNER') appError(403, 'org_manage_forbidden');
			const given = addresses[org.id];
			if (!org.address && !(given?.line1.trim() && given.postalCode.trim() && given.city.trim())) {
				appError(400, 'dpa_address_required', [org.name]);
			}
		}

		// The address and the acceptance go in together: an acceptance must not
		// exist without the party's address, nor an address be half-saved by a
		// failed acceptance.
		const addressed: string[] = [];
		const accepted: string[] = [];
		await prisma.$transaction(async (tx) => {
			for (const org of orgs) {
				let address = org.address;
				if (!address) {
					const given = addresses[org.id];
					address = await tx.address.create({
						data: {
							line1: given.line1.trim(),
							line2: given.line2?.trim() || null,
							postalCode: given.postalCode.trim(),
							city: given.city.trim()
						}
					});
					await tx.organization.update({
						where: { id: org.id },
						data: { addressId: address.id }
					});
					addressed.push(org.id);
				}
				const acceptance = await tx.dpaAcceptance.create({
					data: {
						organizationId: org.id,
						orgName: org.name,
						orgAddress: formatAddress(address),
						versionHash: hashDpa(dpa.body),
						body: dpa.body,
						userId: user.id,
						userName: user.name || user.email,
						userEmail: user.email
					}
				});
				accepted.push(acceptance.id);
			}
		});

		// The PDF and the mail that carries it take a moment and must not hold
		// the dialog open; deliverDpaAcceptances logs its own failures.
		void deliverDpaAcceptances(accepted);

		// A new address is also the billing address, so whatever shows the
		// organization's billing details — the dashboard's "billing details
		// incomplete" strip reads getMyOrgs — has to hear about it, the same set
		// updateOrg refreshes.
		if (addressed.length > 0) {
			await Promise.all([
				getMyOrgs().refresh(),
				getKnownAddresses().refresh(),
				...addressed.map((id) => getOrgWithMembers(id).refresh())
			]);
		}
	}
);

function isHttpUrl(value: string) {
	try {
		const { protocol } = new URL(value);
		return protocol === 'http:' || protocol === 'https:';
	} catch {
		return false;
	}
}
