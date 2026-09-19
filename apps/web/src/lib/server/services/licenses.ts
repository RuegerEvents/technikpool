import { prisma } from '$lib/server/auth';
import { openSecret, sealSecret } from '$lib/server/secrets';
import {
	isSystemAdmin,
	productionVisibility,
	visibleProductionName,
	writableOrgIds
} from './access';
import type { LicenseCredentials, LicenseHolder, RevealGrant } from '$lib/license';

// Who may see a licence's credentials, and who has the licence right now.
//
// The rule is deliberately narrower than "may read the asset". Seeing a key is
// using the licence, so it takes one of two reasons:
//
// - the licence is checked out to a production the user crews, or may write in
//   — the person running the show needs the key on site;
// - the user may write in the org whose location keeps the licence — the people
//   who look after it. A VIEWER is not among them: that rung reads records, and
//   a key is not a record.
//
// A system admin passes, as they pass every other gate (see `requireOrgRole`),
// and the audit entry says that this is why.

/** For each of these assets, the grounds on which this user may reveal its credentials. */
export async function revealGrants(
	userId: string,
	assetIds: string[]
): Promise<Map<string, RevealGrant>> {
	const grants = new Map<string, RevealGrant>();
	if (assetIds.length === 0) return grants;

	if (await isSystemAdmin(userId)) {
		for (const id of assetIds) grants.set(id, { via: 'admin' });
		return grants;
	}

	const writable = await writableOrgIds(userId);
	const assets = await prisma.asset.findMany({
		where: { id: { in: assetIds } },
		select: { id: true, location: { select: { organizationId: true } } }
	});
	for (const asset of assets) {
		if (writable.includes(asset.location.organizationId)) grants.set(asset.id, { via: 'location' });
	}

	const rest = assetIds.filter((id) => !grants.has(id));
	if (rest.length === 0) return grants;

	const items = await prisma.productionItem.findMany({
		where: {
			assetId: { in: rest },
			status: 'CHECKED_OUT',
			production: {
				OR: [{ organizationId: { in: writable } }, { crew: { some: { userId } } }]
			}
		},
		select: { assetId: true, production: { select: { id: true, name: true } } }
	});
	for (const item of items) {
		if (grants.has(item.assetId)) continue;
		grants.set(item.assetId, {
			via: 'production',
			productionId: item.production.id,
			productionName: item.production.name
		});
	}
	return grants;
}

/**
 * The productions each of these licences is checked out to, newest checkout
 * first. Usually one; more only when a licence was checked out again without
 * being returned in between, and then both are true and both are shown.
 */
export async function licenseHolders(
	userId: string,
	assetIds: string[]
): Promise<Map<string, LicenseHolder[]>> {
	const holders = new Map<string, LicenseHolder[]>();
	if (assetIds.length === 0) return holders;

	const [canSee, items, checkouts] = await Promise.all([
		productionVisibility(userId),
		prisma.productionItem.findMany({
			where: { assetId: { in: assetIds }, status: 'CHECKED_OUT' },
			select: {
				assetId: true,
				production: {
					select: {
						id: true,
						name: true,
						startDate: true,
						endDate: true,
						organizationId: true,
						organization: { select: { name: true, shortName: true } }
					}
				}
			}
		}),
		prisma.assetTransaction.findMany({
			where: { assetId: { in: assetIds }, action: 'CHECKED_OUT' },
			select: {
				assetId: true,
				productionId: true,
				createdAt: true,
				user: { select: { name: true, email: true } }
			},
			orderBy: { createdAt: 'desc' }
		})
	]);

	for (const item of items) {
		const visible = canSee(item.production);
		const checkout = checkouts.find(
			(c) => c.assetId === item.assetId && c.productionId === item.production.id
		);
		const list = holders.get(item.assetId) ?? [];
		list.push({
			productionId: visible ? item.production.id : null,
			productionName: visibleProductionName(item.production, canSee),
			startDate: item.production.startDate,
			endDate: item.production.endDate,
			since: checkout?.createdAt ?? null,
			// Who in another org handled it is that org's business.
			checkedOutBy: visible && checkout ? checkout.user.name || checkout.user.email : null
		});
		holders.set(item.assetId, list);
	}
	for (const list of holders.values()) {
		list.sort((a, b) => (b.since?.getTime() ?? 0) - (a.since?.getTime() ?? 0));
	}
	return holders;
}

type StoredPayload =
	| { licenseKey: string; note: string | null }
	| { username: string; password: string | null; note: string | null };

export function sealCredentials(credentials: LicenseCredentials) {
	const payload: StoredPayload =
		credentials.kind === 'key'
			? { licenseKey: credentials.licenseKey, note: credentials.note }
			: { username: credentials.username, password: credentials.password, note: credentials.note };
	return { kind: credentials.kind, sealed: sealSecret(JSON.stringify(payload)) };
}

export function openCredentials(row: { kind: string; sealed: string }): LicenseCredentials {
	const payload = JSON.parse(openSecret(row.sealed));
	if (row.kind === 'key') {
		return { kind: 'key', licenseKey: payload.licenseKey ?? '', note: payload.note ?? null };
	}
	return {
		kind: 'login',
		username: payload.username ?? '',
		password: payload.password ?? null,
		note: payload.note ?? null
	};
}
