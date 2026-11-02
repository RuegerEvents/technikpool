import { createHash } from 'node:crypto';
import { prisma } from '../auth';
import { appBaseUrl } from '../app-url';
import { appError } from '#lib/errors.js';
import type { Prisma } from '#lib/prisma/client.js';
import defaultSource from '../rental-terms-default.md?raw';
import { DEFAULT_INVOICE_CLOSING, DEFAULT_OFFER_CLOSING } from '#lib/billing-text.js';
import { RENTAL_TERMS_PLACEHOLDERS } from '#lib/rental-terms-text.js';

// An org's rental terms (Miet-AGB): the conditions it rents equipment out on,
// to its customers and to other orgs that borrow from it.
//
// - Off until an ADMIN+ switches them on. Switching on the first time copies
//   the bundled default (rental-terms-default.md) into the org, so a release
//   that rewords the default never changes an org's terms behind its back.
// - Every save is a new RentalTermsVersion; none is ever edited. The org
//   points at the one in force (`Organization.rentalTermsVersionId`, null =
//   off). Versions are numbered 1, 2, 3 … per org. Documents and acceptances
//   point at the version they were given, and /rental-terms/<org slug>/<number>
//   shows that wording for as long as it exists.
// - Placeholders are filled in when a version is saved, not when it is read:
//   a version's text must not move because the org changed its address.
//
// Where they show: appended to the offer PDF (the offer is where they become
// part of the contract), cited on invoice, delivery note, e-invoice XML and
// the customer link, and agreed to by an org before it asks this one to lend.

export const DEFAULT_RENTAL_TERMS: string = defaultSource;

export type RentalTermsOrg = {
	name: string;
	paymentTermsDays: number;
	address: { line1: string; line2: string | null; postalCode: string; city: string } | null;
};

export function renderRentalTerms(source: string, org: RentalTermsOrg): string {
	const values: Record<string, string> = {
		org: org.name,
		// Comma-separated, as an address reads inside a sentence.
		orgAddress: org.address
			? [org.address.line1, org.address.line2, `${org.address.postalCode} ${org.address.city}`]
					.map((part) => part?.trim())
					.filter(Boolean)
					.join(', ')
			: org.name,
		paymentTermsDays: String(org.paymentTermsDays)
	};
	return source.replace(
		/\{([A-Za-z]+)\}/g,
		(placeholder, key: string) => values[key] ?? placeholder
	);
}

export function rentalTermsHash(body: string) {
	return createHash('sha256').update(body).digest('hex');
}

/** Where a version can be read, signed out. Printed on documents, so absolute. */
export function rentalTermsUrl(version: { number: number; organization: { slug: string } }) {
	return `${appBaseUrl}/rental-terms/${version.organization.slug}/${version.number}`;
}

/** "02.11.2026" — the "Stand" a document cites a version by. */
export function rentalTermsDate(version: { createdAt: Date }) {
	return version.createdAt.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' });
}

/** What a document needs to cite or attach a version. */
export type CitedRentalTerms = {
	id: string;
	number: number;
	orgName: string;
	orgSlug: string;
	body: string;
	date: string;
	url: string;
};

const citedSelect = {
	id: true,
	number: true,
	body: true,
	createdAt: true,
	organization: { select: { name: true, slug: true } }
} satisfies Prisma.RentalTermsVersionSelect;

function cite(
	version: Prisma.RentalTermsVersionGetPayload<{ select: typeof citedSelect }>
): CitedRentalTerms {
	return {
		id: version.id,
		number: version.number,
		orgName: version.organization.name,
		orgSlug: version.organization.slug,
		body: version.body,
		date: rentalTermsDate(version),
		url: rentalTermsUrl(version)
	};
}

async function citeById(versionId: string | null | undefined) {
	if (!versionId) return null;
	const version = await prisma.rentalTermsVersion.findUnique({
		where: { id: versionId },
		select: citedSelect
	});
	return version ? cite(version) : null;
}

async function activeVersionId(organizationId: string) {
	const org = await prisma.organization.findUniqueOrThrow({
		where: { id: organizationId },
		select: { rentalTermsVersionId: true }
	});
	return org.rentalTermsVersionId;
}

/**
 * The version a production's latest sent offer from `organizationId` carries.
 * An invoice and a delivery note cite what the customer agreed to, not what
 * the org's terms say by the time the event is over.
 */
async function offeredVersionId(productionId: string, organizationId: string) {
	const offer = await prisma.offer.findFirst({
		where: {
			productionId,
			organizationId,
			finalizedAt: { not: null },
			rentalTermsVersionId: { not: null }
		},
		orderBy: { finalizedAt: 'desc' },
		select: { rentalTermsVersionId: true }
	});
	return offer?.rentalTermsVersionId ?? null;
}

/**
 * The version an offer or invoice prints. Once finalized it is the one stored
 * on it. A draft offer follows the org's version in force; a draft invoice its
 * offer's, else the production's latest sent offer's, else the org's in force.
 */
export async function documentRentalTermsVersionId(
	kind: 'offer' | 'invoice',
	doc: {
		organizationId: string;
		productionId: string | null;
		rentalTermsVersionId: string | null;
		issued: boolean;
		offerId?: string | null;
	}
): Promise<string | null> {
	if (doc.issued) return doc.rentalTermsVersionId;
	if (kind === 'invoice') {
		if (doc.offerId) {
			const offer = await prisma.offer.findUnique({
				where: { id: doc.offerId },
				select: { rentalTermsVersionId: true }
			});
			if (offer?.rentalTermsVersionId) return offer.rentalTermsVersionId;
		}
		if (doc.productionId) {
			const offered = await offeredVersionId(doc.productionId, doc.organizationId);
			if (offered) return offered;
		}
	}
	return activeVersionId(doc.organizationId);
}

export async function citedRentalTerms(versionId: string | null) {
	return citeById(versionId);
}

/** The terms a production's delivery note and customer link cite. */
export async function productionRentalTerms(production: {
	id: string;
	organizationId: string;
}): Promise<CitedRentalTerms | null> {
	const versionId =
		(await offeredVersionId(production.id, production.organizationId)) ??
		(await activeVersionId(production.organizationId));
	return citeById(versionId);
}

// ── Editing ─────────────────────────────────────────────────────────────────

const orgForTerms = {
	name: true,
	slug: true,
	paymentTermsDays: true,
	rentalTermsVersionId: true,
	address: { select: { line1: true, line2: true, postalCode: true, city: true } }
} satisfies Prisma.OrganizationSelect;

/**
 * Saves `source` as the org's terms in force. Writes a version only when the
 * text differs from the one in force, so pressing Save twice leaves one.
 */
export async function saveRentalTerms(organizationId: string, source: string, userId: string) {
	const trimmed = source.trim();
	if (!trimmed) appError(400, 'rental_terms_empty');
	return prisma.$transaction(async (tx) => {
		await tx.$queryRaw`SELECT 1 FROM "Organization" WHERE id = ${organizationId} FOR UPDATE`;
		const org = await tx.organization.findUniqueOrThrow({
			where: { id: organizationId },
			select: { ...orgForTerms, rentalTermsVersion: { select: { source: true, hash: true } } }
		});
		const body = renderRentalTerms(trimmed, org);
		const hash = rentalTermsHash(body);
		const current = org.rentalTermsVersion;
		if (current && current.hash === hash && current.source === trimmed)
			return org.rentalTermsVersionId!;
		// Numbered under the org row's lock taken above, so two saves can't both
		// take the same number.
		const last = await tx.rentalTermsVersion.aggregate({
			where: { organizationId },
			_max: { number: true }
		});
		const version = await tx.rentalTermsVersion.create({
			data: {
				organizationId,
				number: (last._max.number ?? 0) + 1,
				source: trimmed,
				body,
				hash,
				createdById: userId
			}
		});
		await tx.organization.update({
			where: { id: organizationId },
			data: { rentalTermsVersionId: version.id }
		});
		return version.id;
	});
}

/**
 * Switching on brings back the latest saved version, or the bundled default
 * the first time. Switching off keeps every version: documents still link them.
 */
export async function setRentalTermsEnabled(
	organizationId: string,
	enabled: boolean,
	userId: string
) {
	if (!enabled) {
		await prisma.organization.update({
			where: { id: organizationId },
			data: { rentalTermsVersionId: null }
		});
		return;
	}
	const latest = await prisma.rentalTermsVersion.findFirst({
		where: { organizationId },
		orderBy: { number: 'desc' },
		select: { id: true, source: true }
	});
	// Through saveRentalTerms, so the placeholders are filled with the org's
	// details as they are now; it reuses the old version if nothing changed.
	await saveRentalTerms(organizationId, latest?.source ?? DEFAULT_RENTAL_TERMS, userId);
}

/** The settings card: the text in force (or what switching on would bring), and its history. */
export async function rentalTermsSettings(organizationId: string) {
	const org = await prisma.organization.findUniqueOrThrow({
		where: { id: organizationId },
		select: { ...orgForTerms, offerClosingTemplate: true, invoiceClosingTemplate: true }
	});
	const cites = (template: string) => RENTAL_TERMS_PLACEHOLDERS.some((p) => template.includes(p));
	const versions = await prisma.rentalTermsVersion.findMany({
		where: { organizationId },
		orderBy: { number: 'desc' },
		select: {
			id: true,
			number: true,
			source: true,
			body: true,
			createdAt: true,
			createdBy: { select: { name: true } }
		}
	});
	const active = versions.find((v) => v.id === org.rentalTermsVersionId) ?? null;
	const source = (active ?? versions[0])?.source ?? DEFAULT_RENTAL_TERMS;
	return {
		enabled: !!active,
		activeVersionId: active?.id ?? null,
		source,
		defaultSource: DEFAULT_RENTAL_TERMS,
		// The org's name, address or payment term changed since the version in
		// force was saved: saving again writes them into the text.
		outdated: !!active && renderRentalTerms(active.source, org) !== active.body,
		orgSlug: org.slug,
		// An org's own closing text that predates rental terms doesn't mention
		// them; the card points at the billing presets then.
		closingCites: {
			offer: cites(org.offerClosingTemplate ?? DEFAULT_OFFER_CLOSING),
			invoice: cites(org.invoiceClosingTemplate ?? DEFAULT_INVOICE_CLOSING)
		},
		versions: versions.map((v) => ({
			id: v.id,
			number: v.number,
			createdAt: v.createdAt,
			createdBy: v.createdBy?.name ?? null
		}))
	};
}

// ── Lending between orgs ────────────────────────────────────────────────────

/**
 * For each lender, the terms the borrowing org has to agree to before it asks
 * to borrow, and whether it already has (once per version is enough).
 */
export async function lenderRentalTerms(borrowerOrgId: string, lenderOrgIds: string[]) {
	const lenders = await prisma.organization.findMany({
		where: { id: { in: lenderOrgIds }, rentalTermsVersionId: { not: null } },
		select: {
			id: true,
			name: true,
			shortName: true,
			slug: true,
			rentalTermsVersion: { select: { id: true, number: true, createdAt: true } }
		}
	});
	const accepted = await prisma.rentalTermsAcceptance.findMany({
		where: {
			organizationId: borrowerOrgId,
			versionId: { in: lenders.map((l) => l.rentalTermsVersion!.id) }
		},
		orderBy: { acceptedAt: 'desc' },
		select: { id: true, versionId: true }
	});
	return lenders.map((lender) => {
		const version = lender.rentalTermsVersion!;
		return {
			organizationId: lender.id,
			name: lender.name,
			shortName: lender.shortName,
			versionId: version.id,
			slug: lender.slug,
			number: version.number,
			date: rentalTermsDate(version),
			acceptanceId: accepted.find((a) => a.versionId === version.id)?.id ?? null
		};
	});
}

/**
 * Inside the transaction that sends loan requests: the acceptance each lender's
 * request is sent under, recording the ones ticked in this send. A lender whose
 * terms are neither accepted before nor ticked now stops the whole send.
 */
export async function acceptLenderTerms(
	tx: Prisma.TransactionClient,
	borrower: { id: string; name: string },
	lenderOrgIds: string[],
	acceptedVersionIds: string[],
	user: { id: string; name: string; email: string }
): Promise<Map<string, string>> {
	const lenders = await tx.organization.findMany({
		where: { id: { in: lenderOrgIds }, rentalTermsVersionId: { not: null } },
		select: { id: true, name: true, rentalTermsVersionId: true }
	});
	const result = new Map<string, string>();
	for (const lender of lenders) {
		const versionId = lender.rentalTermsVersionId!;
		const existing = await tx.rentalTermsAcceptance.findFirst({
			where: { organizationId: borrower.id, versionId },
			select: { id: true }
		});
		if (existing) {
			result.set(lender.id, existing.id);
			continue;
		}
		// The client sends the version it showed. If the lender saved new terms
		// in the meantime, that tick was for a text that is no longer in force.
		if (!acceptedVersionIds.includes(versionId)) {
			appError(409, 'rental_terms_not_accepted', [lender.name]);
		}
		const acceptance = await tx.rentalTermsAcceptance.create({
			data: {
				versionId,
				organizationId: borrower.id,
				orgName: borrower.name,
				lenderName: lender.name,
				userId: user.id,
				userName: user.name,
				userEmail: user.email
			},
			select: { id: true }
		});
		result.set(lender.id, acceptance.id);
	}
	return result;
}
