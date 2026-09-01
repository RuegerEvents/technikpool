import { query, command } from '$app/server';
import { prisma } from '$lib/server/auth';
import * as v from 'valibot';
import { orgLabel } from '$lib/utils';
import { getProduction } from './productions.remote';
import { requireAuth, userOrgIds } from '$lib/server/services/access';
import { ACTIVE_ASSET_WHERE } from '$lib/asset-status';
import { accessoryIdsOf } from '$lib/server/services/accessories';

const ACTIVE_STATUSES = ['PENDING', 'APPROVED', 'CHECKED_OUT', 'RETURNED'] as const;
const CONFLICT_STATUSES = ['PENDING', 'APPROVED', 'CHECKED_OUT'] as const;

// Full-page equipment editor (categories | available | booked) — replaces the
// per-Asset add/remove flow with per-Product-x-org-x-location quantities.
export const getEquipmentEditorData = query(v.string(), async (productionId: string) => {
	const user = await requireAuth();
	const orgIds = await userOrgIds(user.id);

	const production = await prisma.production.findUniqueOrThrow({
		where: { id: productionId },
		select: { id: true, name: true, startDate: true, endDate: true, organizationId: true }
	});

	// Accessories are not bookable on their own: they follow whatever they are
	// attached to, and a row for "8× Omega Bracket" next to the fixtures they
	// are bolted to is a way to book the same thing twice. They are left out of
	// the counts as well as the picker, so `total` still means "units you can
	// ask for".
	const assets = await prisma.asset.findMany({
		where: { organizationId: { in: orgIds }, parentAssetId: null, ...ACTIVE_ASSET_WHERE },
		include: {
			product: { include: { manufacturer: true, category: true } },
			organization: {
				select: { id: true, name: true, shortName: true, color: true, avatarLabel: true }
			},
			location: { select: { id: true, name: true, address: { select: { city: true } } } },
			productionItems: {
				where: {
					status: { in: [...ACTIVE_STATUSES] },
					OR: [
						{ productionId },
						production.startDate && production.endDate
							? {
									status: { in: [...CONFLICT_STATUSES] },
									production: {
										startDate: { not: null, lte: production.endDate },
										endDate: { not: null, gte: production.startDate }
									}
								}
							: { id: '__never__' }
					]
				}
			}
		}
	});

	type GroupKey = string;
	type Group = {
		key: GroupKey;
		productId: string;
		productName: string;
		imagePath: string | null;
		manufacturerName: string;
		categoryId: string;
		categoryName: string;
		categoryNameDe: string | null;
		categoryColor: string;
		categorySortOrder: number;
		organizationId: string;
		organizationName: string;
		organizationColor: string;
		organizationAvatarLabel: string;
		locationId: string;
		locationName: string;
		city: string;
		total: number;
		bookedHere: number;
		unavailableElsewhere: number;
		// Available (not booked here, not conflicting elsewhere) assets that
		// belong to a bundle — hidden from the individual-add flow by default.
		bundledAvailable: number;
		// Of bookedHere, how many were added as part of a bundle — the booked
		// panel shows those under their bundle instead of the product row, and
		// the product row's stepper only ever touches the difference. A unit is
		// booked either individually or through a bundle, never counted as both.
		bookedFromBundle: number;
	};
	const groups = new Map<GroupKey, Group>();
	const assetStatus = new Map<
		string,
		{ bookedHere: boolean; bookedFromBundleId: string | null; unavailableElsewhere: boolean }
	>();

	for (const a of assets) {
		const key = `${a.productId}:${a.organizationId}:${a.locationId}`;
		if (!groups.has(key)) {
			groups.set(key, {
				key,
				productId: a.productId,
				productName: a.product.name,
				imagePath: a.generatedImagePath ?? a.product.imagePath,
				manufacturerName: a.product.manufacturer.name,
				categoryId: a.product.categoryId,
				categoryName: a.product.category.name,
				categoryNameDe: a.product.category.nameDe,
				categoryColor: a.product.category.color,
				categorySortOrder: a.product.category.sortOrder,
				organizationId: a.organizationId,
				organizationName: orgLabel(a.organization),
				organizationColor: a.organization.color,
				organizationAvatarLabel: a.organization.avatarLabel,
				locationId: a.locationId,
				locationName: a.location.name,
				city: a.location.address.city,
				total: 0,
				bookedHere: 0,
				unavailableElsewhere: 0,
				bundledAvailable: 0,
				bookedFromBundle: 0
			});
		}
		const g = groups.get(key)!;
		// Prefer a unit preview with its attached accessories over the bare
		// catalogue image when any asset in this grouped row has one.
		if (a.generatedImagePath) g.imagePath = a.generatedImagePath;
		g.total++;
		const bookedItem = a.productionItems.find((pi) => pi.productionId === productionId);
		const bookedHere = !!bookedItem;
		const unavailableElsewhere = !bookedHere && a.productionItems.length > 0;
		assetStatus.set(a.id, {
			bookedHere,
			bookedFromBundleId: bookedItem?.sourceBundleId ?? null,
			unavailableElsewhere
		});
		if (bookedHere) {
			g.bookedHere++;
			if (bookedItem.sourceBundleId) g.bookedFromBundle++;
		} else if (unavailableElsewhere) g.unavailableElsewhere++;
		else if (a.bundleId) g.bundledAvailable++;
	}

	const assetBundles = await prisma.assetBundle.findMany({
		where: { template: { organizationId: { in: orgIds } } },
		include: {
			template: {
				include: {
					category: {
						select: { id: true, name: true, nameDe: true, color: true, sortOrder: true }
					},
					organization: {
						select: { id: true, name: true, shortName: true, color: true, avatarLabel: true }
					}
				}
			},
			location: { select: { id: true, name: true, address: { select: { city: true } } } },
			// Same exclusion as above: an accessory mirrors its parent's bundleId,
			// so it is in this kit — but it is not a unit anyone books, and
			// counting it would make the kit look bigger than it is orderable.
			assets: {
				where: { parentAssetId: null },
				include: { product: { include: { manufacturer: true } } }
			}
		}
	});

	const bundles = assetBundles
		.map((b) => {
			// Only units this production booked *through this bundle* count as the
			// bundle's. One that was added individually stays on its product row
			// until adding the bundle adopts it — otherwise the same unit would
			// show up in both panels.
			let bookedHere = 0;
			let availableCount = 0;
			for (const a of b.assets) {
				const status = assetStatus.get(a.id);
				if (status?.bookedFromBundleId === b.id) bookedHere++;
				else if (!status?.unavailableElsewhere) availableCount++;
			}
			return {
				id: b.id,
				templateId: b.templateId,
				name: b.template.name,
				imagePath: b.imagePath,
				tag: b.tag,
				categoryId: b.template.categoryId,
				categoryName: b.template.category.name,
				categoryNameDe: b.template.category.nameDe,
				categoryColor: b.template.category.color,
				categorySortOrder: b.template.category.sortOrder,
				organizationId: b.template.organizationId,
				organizationName: orgLabel(b.template.organization),
				organizationColor: b.template.organization.color,
				organizationAvatarLabel: b.template.organization.avatarLabel,
				locationId: b.locationId,
				locationName: b.location?.name ?? null,
				city: b.location?.address.city ?? null,
				totalAssets: b.assets.length,
				bookedHere,
				availableCount,
				memberSearchText: b.assets
					.map((a) => `${a.product.manufacturer.name} ${a.product.name}`)
					.join(' ')
					.toLowerCase()
			};
		})
		.filter((b) => b.totalAssets > 0);

	return {
		production,
		groups: [...groups.values()].sort((a, b) => a.productName.localeCompare(b.productName)),
		bundles: bundles.sort((a, b) => a.name.localeCompare(b.name))
	};
});

const setQuantitySchema = v.object({
	productionId: v.string(),
	productId: v.string(),
	organizationId: v.string(),
	locationId: v.string(),
	quantity: v.number(),
	includeBundled: v.optional(v.boolean())
});

export const setProductionQuantity = command(setQuantitySchema, async (data) => {
	const user = await requireAuth();

	const production = await prisma.production.findUniqueOrThrow({
		where: { id: data.productionId }
	});

	// A unit booked as part of a bundle belongs to that bundle's row, not to
	// this product row: the quantity here counts and removes only individually
	// booked units, so the same unit is never in both places.
	const currentItems = await prisma.productionItem.findMany({
		where: {
			productionId: data.productionId,
			status: { in: [...ACTIVE_STATUSES] },
			sourceBundleId: null,
			asset: {
				productId: data.productId,
				organizationId: data.organizationId,
				locationId: data.locationId,
				// An accessory of the same product as a loose unit (a spare power
				// cable next to the attached ones) is booked through its parent, not
				// through this row's count.
				parentAssetId: null
			}
		},
		select: { id: true, assetId: true }
	});

	// …but every unit already in the production is off the table as a candidate,
	// however it got there.
	const bookedAssetIds = (
		await prisma.productionItem.findMany({
			where: { productionId: data.productionId },
			select: { assetId: true }
		})
	).map((i) => i.assetId);

	const currentCount = currentItems.length;
	const delta = data.quantity - currentCount;
	if (delta === 0) return { changed: 0 };

	if (delta > 0) {
		let candidates = await prisma.asset.findMany({
			where: {
				productId: data.productId,
				organizationId: data.organizationId,
				locationId: data.locationId,
				...ACTIVE_ASSET_WHERE,
				parentAssetId: null,
				id: { notIn: bookedAssetIds },
				...(data.includeBundled ? {} : { bundleId: null })
			},
			orderBy: { createdAt: 'asc' }
		});

		if (production.startDate && production.endDate) {
			const conflicting = await prisma.productionItem.findMany({
				where: {
					assetId: { in: candidates.map((a) => a.id) },
					productionId: { not: data.productionId },
					status: { in: [...CONFLICT_STATUSES] },
					production: {
						startDate: { not: null, lte: production.endDate },
						endDate: { not: null, gte: production.startDate }
					}
				},
				select: { assetId: true }
			});
			const conflictIds = new Set(conflicting.map((c) => c.assetId));
			candidates = candidates.filter((a) => !conflictIds.has(a.id));
		}

		if (candidates.length < delta) {
			throw new Error(`Only ${candidates.length} more unit(s) available to add`);
		}

		const toAdd = candidates.slice(0, delta);
		const isCrossOrg = production.organizationId !== data.organizationId;
		const status = isCrossOrg ? 'PENDING' : 'APPROVED';

		// What is bolted to a unit ships with it. These get real ProductionItem
		// rows — `@@unique([productionId, assetId])` is what makes a scan of the
		// cable find something to check out — but no conflict check of their own:
		// an accessory can't be booked independently, so the parent's check above
		// already covers it. `skipDuplicates` adopts one that was booked on its
		// own before it was attached, rather than failing the whole batch.
		const accessoriesByParent = await accessoryIdsOf(toAdd.map((a) => a.id));
		const accessoryIds = [...accessoriesByParent.values()].flat();

		await prisma.$transaction([
			...toAdd.map((asset) =>
				prisma.productionItem.create({
					data: { productionId: data.productionId, assetId: asset.id, status }
				})
			),
			...(accessoryIds.length > 0
				? [
						prisma.productionItem.createMany({
							data: accessoryIds.map((assetId) => ({
								productionId: data.productionId,
								assetId,
								sourceParentAssetId: [...accessoriesByParent.entries()].find(([, ids]) =>
									ids.includes(assetId)
								)?.[0],
								status
							})),
							skipDuplicates: true
						})
					]
				: []),
			prisma.assetTransaction.createMany({
				data: [...toAdd.map((a) => a.id), ...accessoryIds].map((assetId) => ({
					assetId,
					userId: user.id,
					productionId: data.productionId,
					action: isCrossOrg ? 'REQUESTED' : 'ADDED_TO_PRODUCTION',
					data: {
						type: isCrossOrg ? 'REQUESTED' : 'ADDED_TO_PRODUCTION',
						productionId: data.productionId,
						productionName: production.name
					}
				}))
			})
		]);
	} else {
		const toRemove = currentItems.slice(0, -delta);
		const removedAssetIds = toRemove.map((i) => i.assetId);
		await prisma.productionItem.deleteMany({
			where: {
				productionId: data.productionId,
				OR: [
					{ id: { in: toRemove.map((i) => i.id) } },
					// The accessories came in with the parent; they leave with it.
					{ sourceParentAssetId: { in: removedAssetIds } }
				]
			}
		});
	}

	await getEquipmentEditorData(data.productionId).refresh();
	await getProduction(data.productionId).refresh();
	return { changed: delta };
});
