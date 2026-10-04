import { visibleProductionName } from './access';

/**
 * Where a unit is right now when that isn't its shelf. Checking a unit out
 * leaves `Asset.locationId` alone — that is where it goes back to — so a list
 * answering "where is it?" has to ask the open `CHECKED_OUT` item as well.
 *
 * Include `CHECKED_OUT_TO_INCLUDE` on the asset and pass each row through the
 * function `checkedOutTo` returns: it swaps the raw item for `checkedOutTo`,
 * named the way the asset history names a production the user may not open
 * (the borrowing org, and no id to link to).
 */
export const CHECKED_OUT_TO_INCLUDE = {
	productionItems: {
		where: { status: 'CHECKED_OUT' },
		select: {
			production: {
				select: {
					id: true,
					name: true,
					organizationId: true,
					organization: { select: { name: true, shortName: true } }
				}
			}
		},
		take: 1
	}
} as const;

type ProductionName = {
	id: string;
	name: string;
	organizationId: string;
	organization: { name: string; shortName: string | null };
};

export type CheckedOutTo = { productionId: string | null; name: string } | null;

export function checkedOutTo(
	canSee: (production: { id: string; organizationId: string }) => boolean
) {
	return <A extends { productionItems: { production: ProductionName }[] }>({
		productionItems,
		...asset
	}: A): Omit<A, 'productionItems'> & { checkedOutTo: CheckedOutTo } => {
		const production = productionItems[0]?.production;
		return {
			...asset,
			checkedOutTo: production
				? {
						productionId: canSee(production) ? production.id : null,
						name: visibleProductionName(production, canSee)
					}
				: null
		};
	};
}
