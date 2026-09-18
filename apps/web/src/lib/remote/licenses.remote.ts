import { query, command } from '$app/server';
import * as v from 'valibot';
import { prisma } from '$lib/server/auth';
import {
	isSystemAdmin,
	orgRole,
	requireAuth,
	requireOrgInventory,
	scopedOrgIds,
	userOrgIds,
	writableOrgIds
} from '$lib/server/services/access';
import {
	licenseHolders,
	openCredentials,
	revealGrants,
	sealCredentials
} from '$lib/server/services/licenses';
import { ACTIVE_ASSET_WHERE } from '$lib/asset-status';
import { appError } from '$lib/errors';
import { ROLE_FOR, roleAtLeast } from '$lib/roles';
import type { LicenseCredentialKind, LicenseCredentials } from '$lib/license';
import type {
	CredentialsRemovedData,
	CredentialsRevealedData,
	CredentialsSetData
} from '$lib/types/asset-transaction';
import { getAssetHistory } from '$lib/remote/assets.remote';

// Licences are assets like any other — booked, checked out, returned by the
// same paths. What is theirs alone is the credentials, and everything that
// touches those is in this file. Nothing here ever returns a key except
// `revealLicenseCredentials`, which is a command so that no cache, prefetch or
// refresh can fetch one without somebody having asked for it.

/**
 * Every licence the user can find: the ones their orgs keep, and — without an
 * org filter — the ones checked out to a production they crew or work on, which
 * is how a technician from another org finds the key for tonight's show.
 */
export const getLicenses = query(v.optional(v.string()), async (organizationId?: string) => {
	const user = await requireAuth();
	const orgIds = await scopedOrgIds(user.id, organizationId);
	const writable = organizationId ? [] : await writableOrgIds(user.id);

	const assets = await prisma.asset.findMany({
		where: {
			...ACTIVE_ASSET_WHERE,
			product: { isLicense: true },
			OR: [
				{ organizationId: { in: orgIds } },
				...(organizationId
					? []
					: [
							{
								productionItems: {
									some: {
										status: 'CHECKED_OUT',
										production: {
											OR: [
												{ organizationId: { in: writable } },
												{ crew: { some: { userId: user.id } } }
											]
										}
									}
								}
							}
						])
			]
		},
		select: {
			id: true,
			assetTag: true,
			serialNumber: true,
			status: true,
			organization: { select: { id: true, name: true, shortName: true } },
			location: { select: { id: true, name: true } },
			product: {
				select: {
					id: true,
					name: true,
					imagePath: true,
					categoryId: true,
					manufacturer: { select: { name: true } },
					category: { select: { name: true, nameDe: true, color: true } }
				}
			},
			credentials: { select: { kind: true } }
		},
		orderBy: [
			{ product: { name: 'asc' } },
			{ assetTag: { sort: 'asc', nulls: 'last' } },
			{ id: 'asc' }
		]
	});

	const ids = assets.map((a) => a.id);
	const [holders, grants, memberOrgIds, systemAdmin] = await Promise.all([
		licenseHolders(user.id, ids),
		revealGrants(user.id, ids),
		userOrgIds(user.id),
		isSystemAdmin(user.id)
	]);

	return assets.map(({ credentials, ...asset }) => ({
		...asset,
		storedKind: (credentials?.kind ?? null) as LicenseCredentialKind | null,
		holders: holders.get(asset.id) ?? [],
		canReveal: grants.has(asset.id),
		// A license lent in from another org is listed, but its page is that org's.
		canOpen: systemAdmin || memberOrgIds.includes(asset.organization.id)
	}));
});

/**
 * What the page may know about a licence's credentials without seeing them:
 * whether any are stored and of which kind, and what this user may do about it.
 */
export const getLicenseStatus = query(v.string(), async (assetId: string) => {
	const user = await requireAuth();

	const asset = await prisma.asset.findUniqueOrThrow({
		where: { id: assetId },
		select: {
			organizationId: true,
			product: { select: { isLicense: true } },
			credentials: { select: { kind: true, updatedAt: true } }
		}
	});

	const [grants, orgIds, systemAdmin, holders] = await Promise.all([
		revealGrants(user.id, [assetId]),
		userOrgIds(user.id),
		isSystemAdmin(user.id),
		licenseHolders(user.id, [assetId])
	]);
	const grant = grants.get(assetId) ?? null;
	// Anyone who could open the asset may know a licence is there; so may whoever
	// it is checked out to, who is often not in the org that keeps it.
	if (!systemAdmin && !orgIds.includes(asset.organizationId) && !grant) {
		appError(403, 'unauthorized');
	}

	const role = systemAdmin ? null : await orgRole(user.id, asset.organizationId);

	return {
		isLicense: asset.product.isLicense,
		storedKind: (asset.credentials?.kind ?? null) as LicenseCredentialKind | null,
		updatedAt: asset.credentials?.updatedAt ?? null,
		canReveal: grant !== null,
		canEdit: systemAdmin || (role !== null && roleAtLeast(role, ROLE_FOR.inventory)),
		holders: holders.get(assetId) ?? []
	};
});

/**
 * Opens a licence's credentials for the one user asking, and writes that they
 * looked into the asset's history — with the reason they were allowed to.
 */
export const revealLicenseCredentials = command(
	v.string(),
	async (assetId: string): Promise<LicenseCredentials> => {
		const user = await requireAuth();
		const grant = (await revealGrants(user.id, [assetId])).get(assetId);
		if (!grant) appError(403, 'license_reveal_forbidden');

		const row = await prisma.licenseCredential.findUnique({ where: { assetId } });
		if (!row) appError(404, 'license_nothing_stored');

		const credentials = openCredentials(row);

		await prisma.assetTransaction.create({
			data: {
				assetId,
				userId: user.id,
				productionId: grant.via === 'production' ? grant.productionId : null,
				action: 'CREDENTIALS_REVEALED',
				data: {
					type: 'CREDENTIALS_REVEALED',
					via: grant.via,
					...(grant.via === 'production'
						? { productionId: grant.productionId, productionName: grant.productionName }
						: {})
				} satisfies CredentialsRevealedData
			}
		});
		await getAssetHistory(assetId).refresh();

		return credentials;
	}
);

const optionalText = v.optional(v.nullable(v.string()));

const setLicenseCredentialsSchema = v.object({
	assetId: v.string(),
	kind: v.picklist(['key', 'login']),
	licenseKey: optionalText,
	username: optionalText,
	password: optionalText,
	note: optionalText
});

/**
 * Stores or replaces a licence's credentials. Write-only by design: the form
 * starts empty rather than prefilled, so changing a key never needs the old
 * one to be shown first.
 */
export const setLicenseCredentials = command(setLicenseCredentialsSchema, async (input) => {
	const asset = await prisma.asset.findUniqueOrThrow({
		where: { id: input.assetId },
		select: { id: true, organizationId: true, product: { select: { isLicense: true } } }
	});
	const user = await requireOrgInventory(asset.organizationId, 'license_edit_forbidden');
	if (!asset.product.isLicense) appError(400, 'license_not_a_license');

	// Only what the person typed — never trimmed inside, since a password may
	// well end in a space — but an all-blank field counts as not given.
	const text = (value: string | null | undefined) => (value?.trim() ? value : null);
	const note = text(input.note);

	let credentials: LicenseCredentials;
	if (input.kind === 'key') {
		const licenseKey = text(input.licenseKey);
		if (!licenseKey) appError(400, 'license_credentials_empty');
		credentials = { kind: 'key', licenseKey: licenseKey.trim(), note };
	} else {
		const username = text(input.username);
		if (!username) appError(400, 'license_credentials_empty');
		credentials = {
			kind: 'login',
			username: username.trim(),
			password: text(input.password),
			note
		};
	}

	const sealed = sealCredentials(credentials);
	await prisma.$transaction([
		prisma.licenseCredential.upsert({
			where: { assetId: asset.id },
			create: { assetId: asset.id, ...sealed },
			update: sealed
		}),
		prisma.assetTransaction.create({
			data: {
				assetId: asset.id,
				userId: user.id,
				action: 'CREDENTIALS_SET',
				data: { type: 'CREDENTIALS_SET', kind: credentials.kind } satisfies CredentialsSetData
			}
		})
	]);

	await refreshAfterCredentialChange(asset);
});

export const clearLicenseCredentials = command(v.string(), async (assetId: string) => {
	const asset = await prisma.asset.findUniqueOrThrow({
		where: { id: assetId },
		select: { id: true, organizationId: true }
	});
	const user = await requireOrgInventory(asset.organizationId, 'license_edit_forbidden');

	const { count } = await prisma.licenseCredential.deleteMany({ where: { assetId } });
	if (count === 0) return;
	await prisma.assetTransaction.create({
		data: {
			assetId,
			userId: user.id,
			action: 'CREDENTIALS_REMOVED',
			data: { type: 'CREDENTIALS_REMOVED' } satisfies CredentialsRemovedData
		}
	});

	await refreshAfterCredentialChange(asset);
});

async function refreshAfterCredentialChange(asset: { id: string; organizationId: string }) {
	await Promise.all([
		getLicenseStatus(asset.id).refresh(),
		getAssetHistory(asset.id).refresh(),
		getLicenses(asset.organizationId).refresh(),
		getLicenses().refresh()
	]);
}
