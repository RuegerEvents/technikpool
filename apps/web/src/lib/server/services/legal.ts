import { createHash } from 'node:crypto';
import { prisma } from '../auth';
import { renderMarkdown } from '../markdown';
import { generateDpaPdf } from '../dpa-pdf';
import { getObject, putObject } from '../storage';
import { sendMail } from '../mail';
import { appBaseUrl } from '../app-url';
import { dpaAcceptedEmail } from '../emails/dpa-accepted';
import { PUBLIC_LEGAL_SLUGS, type LegalLink, type LegalSlug } from '$lib/legal.svelte';
import type { LegalDocumentKind } from '$lib/prisma/client';

export const KIND_OF: Record<LegalSlug, LegalDocumentKind> = {
	imprint: 'IMPRINT',
	privacy: 'PRIVACY',
	terms: 'TERMS',
	dpa: 'DPA'
};

const hasText = (s: string | null | undefined): s is string => !!s?.trim();

// Every configured page, in display order. Shared by the layout (footer on the
// sign-in pages, the user menu) and /api/v1/legal, so the scanner lists
// exactly what the web does.
export async function legalLinks(): Promise<LegalLink[]> {
	const docs = await prisma.legalDocument.findMany();
	const links: LegalLink[] = [];
	for (const slug of PUBLIC_LEGAL_SLUGS) {
		const doc = docs.find((d) => d.kind === KIND_OF[slug]);
		if (!doc) continue;
		if (hasText(doc.externalUrl)) {
			links.push({ slug, href: doc.externalUrl.trim(), external: true });
		} else if (hasText(doc.body)) {
			links.push({ slug, href: `/legal/${slug}`, external: false });
		}
	}
	return links;
}

export type LegalPage =
	| { kind: 'redirect'; url: string }
	| { kind: 'text'; html: string; updatedAt: Date }
	| { kind: 'missing' };

export async function legalPage(slug: LegalSlug): Promise<LegalPage> {
	const doc = await prisma.legalDocument.findUnique({ where: { kind: KIND_OF[slug] } });
	if (!doc) return { kind: 'missing' };
	if (slug !== 'dpa' && hasText(doc.externalUrl)) {
		return { kind: 'redirect', url: doc.externalUrl.trim() };
	}
	if (!hasText(doc.body)) return { kind: 'missing' };
	return { kind: 'text', html: renderMarkdown(doc.body), updatedAt: doc.updatedAt };
}

// ── Data processing agreement ────────────────────────────────────────────────
//
// The operator processes each organization's personal data on its behalf, and
// Art. 28 GDPR wants a contract for that; 28(9) allows it in electronic form.
// So the owner of every organization accepts the operator's text in the app,
// and each acceptance is kept with the exact text (DpaAcceptance). A version is
// its hash: edit the text and every organization is asked again. With no text
// set, nothing is asked — an install that doesn't need it never sees it.

export const hashDpa = (body: string) => createHash('sha256').update(body).digest('hex');

export async function currentDpa(): Promise<{ body: string; versionHash: string } | null> {
	const doc = await prisma.legalDocument.findUnique({ where: { kind: 'DPA' } });
	if (!hasText(doc?.body)) return null;
	return { body: doc.body, versionHash: hashDpa(doc.body) };
}

// The organizations this user owns that haven't accepted the version in force.
export async function pendingDpaFor(userId: string) {
	const dpa = await currentDpa();
	if (!dpa) return null;
	const owned = await prisma.organization.findMany({
		where: {
			members: { some: { userId, role: 'OWNER' } },
			NOT: { dpaAcceptances: { some: { versionHash: dpa.versionHash } } }
		},
		select: { id: true, name: true, addressId: true },
		orderBy: { name: 'asc' }
	});
	if (owned.length === 0) return null;
	return {
		// An organization without an address can't be named as a party yet, and
		// a new one has none until someone fills in its billing details — so the
		// dialog asks for it rather than waiting for that.
		orgs: owned.map(({ addressId, ...org }) => ({ ...org, hasAddress: !!addressId })),
		versionHash: dpa.versionHash,
		html: renderMarkdown(dpa.body)
	};
}

// ── The acceptance as a PDF ──────────────────────────────────────────────────

// Outside PUBLIC_PREFIX, so the object store answers 403 to anyone asking it
// directly: the only way to the file is the download route, which checks.
const dpaPdfKey = (acceptanceId: string) => `dpa-acceptances/${acceptanceId}.pdf`;

export function dpaPdfFilename(orgName: string, acceptedAt: Date) {
	const org = orgName
		.normalize('NFKD')
		.replace(/[^\w\s-]/g, '')
		.trim()
		.replace(/\s+/g, '-');
	return `AVV-${org || 'Organisation'}-${acceptedAt.toISOString().slice(0, 10)}.pdf`;
}

// The stored PDF, written on first use. acceptDpa writes it right away; this
// also covers an acceptance whose PDF failed then, without a second code path.
export async function dpaAcceptancePdf(acceptanceId: string): Promise<Uint8Array> {
	const acceptance = await prisma.dpaAcceptance.findUniqueOrThrow({ where: { id: acceptanceId } });
	if (acceptance.pdfPath) return (await getObject(acceptance.pdfPath)).bytes;

	const bytes = await generateDpaPdf({
		orgName: acceptance.orgName,
		orgAddress: acceptance.orgAddress,
		userName: acceptance.userName,
		userEmail: acceptance.userEmail,
		acceptedAt: acceptance.acceptedAt,
		versionHash: acceptance.versionHash,
		instanceUrl: appBaseUrl,
		body: acceptance.body
	});
	const key = await putObject(dpaPdfKey(acceptance.id), bytes, 'application/pdf');
	await prisma.dpaAcceptance.update({ where: { id: acceptance.id }, data: { pdfPath: key } });
	return bytes;
}

// Writes each acceptance's PDF and mails it to the person who accepted. After
// the acceptance is recorded, and never able to undo it: a failure here is
// logged, and the PDF is still there to download (written on demand if need be).
export async function deliverDpaAcceptances(acceptanceIds: string[]) {
	for (const id of acceptanceIds) {
		try {
			const acceptance = await prisma.dpaAcceptance.findUniqueOrThrow({ where: { id } });
			const bytes = await dpaAcceptancePdf(id);
			const mail = dpaAcceptedEmail({
				name: acceptance.userName,
				orgName: acceptance.orgName,
				acceptedAt: acceptance.acceptedAt,
				instanceUrl: appBaseUrl
			});
			await sendMail({
				to: acceptance.userEmail,
				...mail,
				attachments: [
					{
						filename: dpaPdfFilename(acceptance.orgName, acceptance.acceptedAt),
						content: bytes,
						contentType: 'application/pdf'
					}
				]
			});
		} catch (err) {
			console.error(`[dpa] delivering acceptance ${id} failed`, err);
		}
	}
}
