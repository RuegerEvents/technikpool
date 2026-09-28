import { createHmac, timingSafeEqual } from 'node:crypto';
import { prisma } from '$lib/server/auth';
import { appBaseUrl } from '$lib/server/app-url';
import { imageSrc } from '$lib/images';
import { nestAccessories } from '$lib/production-items';
import { naturalCompare } from '$lib/sort';
import type { ShareUnit, ShareView } from '$lib/production-share';

// A production's info link for its customer: what is booked for the job, to
// tick off while packing (in the customer's own browser, nothing is stored
// here) and with each product's manuals and datasheets. Opened with no
// account, so the URL is the credential.
//
// Signed rather than stored, like the calendar feed (calendar-feed.ts): the
// signature covers the production id and Production.shareLinkVersion, so the
// team can show the link again whenever it is asked for, and making a new one
// or revoking it — both bump the version — kills every link signed before.
// It stops working on its own 30 days after the production ends.
//
// What the page gets is `ShareView` and nothing more: no prices, no customer
// record, no internal notes, no ids beyond what the page keys its list on.

/** How long after the production's end a link keeps working. */
const GRACE_DAYS = 30;

/** The item statuses the customer sees: what is booked, not what was asked for. */
const SHARED_STATUSES = ['APPROVED', 'CHECKED_OUT'];

function sign(productionId: string, version: number): string {
	const secret = process.env.BETTER_AUTH_SECRET;
	if (!secret) throw new Error('BETTER_AUTH_SECRET is not set');
	// The prefix keeps this signature from being valid for anything else signed
	// with the same secret — the calendar feed above all.
	return createHmac('sha256', secret)
		.update(`production-share:${productionId}:${version}`)
		.digest('base64url');
}

export function shareUrl(productionId: string, version: number): string {
	return `${appBaseUrl}/share/${encodeURIComponent(productionId)}/${sign(productionId, version)}`;
}

/** When a link to this production stops working, or null while it has no end date. */
export function shareExpiry(production: { endDate: Date | null }): Date | null {
	if (!production.endDate) return null;
	return new Date(production.endDate.getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * The page's data for a link, or null for any link that does not open —
 * unknown production, wrong or outdated signature, revoked, or expired. All
 * the same to the visitor, so none of it is told apart.
 */
export async function resolveShare(productionId: string, signature: string) {
	const production = await prisma.production.findUnique({
		where: { id: productionId },
		include: {
			organization: { select: { name: true, logoPath: true } },
			address: true,
			items: {
				where: { status: { in: SHARED_STATUSES } },
				include: {
					asset: {
						select: {
							id: true,
							assetTag: true,
							parentAssetId: true,
							productId: true,
							product: {
								select: {
									name: true,
									caption: true,
									imagePath: true,
									manufacturer: { select: { name: true } }
								}
							}
						}
					},
					sourceBundle: {
						select: {
							id: true,
							tag: true,
							imagePath: true,
							template: { select: { name: true, caption: true } }
						}
					}
				}
			}
		}
	});
	if (!production?.shareLinkActive) return null;
	const expected = Buffer.from(sign(production.id, production.shareLinkVersion));
	const given = Buffer.from(signature);
	if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
	const expiresAt = shareExpiry(production);
	if (expiresAt && expiresAt < new Date()) return null;

	const unitOf = (item: (typeof production.items)[number]) => ({
		id: item.asset.id,
		name: item.asset.product.name,
		caption: item.asset.product.caption,
		manufacturer: item.asset.product.manufacturer?.name ?? null,
		tag: item.asset.assetTag,
		productId: item.asset.productId,
		imageUrl: imageSrc(item.asset.product.imagePath)
	});
	const byUnit = (a: ShareUnit, b: ShareUnit) =>
		naturalCompare(a.name, b.name) || naturalCompare(a.tag ?? '', b.tag ?? '');

	const nested = nestAccessories(production.items).map((item) => ({
		item,
		unit: {
			...unitOf(item),
			accessories: item.accessories.map((accessory) => ({
				id: accessory.asset.id,
				name: accessory.asset.product.name,
				tag: accessory.asset.assetTag,
				imageUrl: imageSrc(accessory.asset.product.imagePath)
			}))
		} satisfies ShareUnit
	}));

	const bundles = new Map<string, ShareView['bundles'][number]>();
	const units: ShareUnit[] = [];
	for (const { item, unit } of nested) {
		const bundle = item.sourceBundle;
		if (!bundle) {
			units.push(unit);
			continue;
		}
		let entry = bundles.get(bundle.id);
		if (!entry) {
			entry = {
				id: bundle.id,
				name: bundle.template.name,
				caption: bundle.template.caption,
				tag: bundle.tag,
				imageUrl: imageSrc(bundle.imagePath),
				units: []
			};
			bundles.set(bundle.id, entry);
		}
		entry.units.push(unit);
	}

	const productIds = [...new Set(production.items.map((item) => item.asset.productId))];
	const documents: ShareView['documents'] = {};
	for (const document of await prisma.productDocument.findMany({
		where: { productId: { in: productIds } },
		orderBy: [{ kind: 'asc' }, { title: 'asc' }],
		select: { id: true, productId: true, kind: true, title: true, path: true }
	})) {
		(documents[document.productId] ??= []).push({
			id: document.id,
			kind: document.kind,
			title: document.title,
			url: imageSrc(document.path)!
		});
	}

	const address = production.address;
	const view: ShareView = {
		production: {
			name: production.name,
			start: (production.showStartDate ?? production.startDate)?.toISOString() ?? null,
			end: (production.showEndDate ?? production.endDate)?.toISOString() ?? null,
			venue:
				[
					production.venueName,
					address && [address.postalCode, address.city].filter(Boolean).join(' ')
				]
					.map((part) => part?.trim())
					.filter(Boolean)
					.join(', ') || null
		},
		organization: {
			name: production.organization.name,
			logoUrl: imageSrc(production.organization.logoPath)
		},
		bundles: [...bundles.values()]
			.map((bundle) => ({ ...bundle, units: bundle.units.sort(byUnit) }))
			.sort((a, b) => naturalCompare(a.name, b.name) || naturalCompare(a.tag ?? '', b.tag ?? '')),
		units: units.sort(byUnit),
		documents,
		expiresAt: expiresAt?.toISOString() ?? null
	};
	return view;
}
