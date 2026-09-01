import { prisma } from '$lib/server/auth';
import type { Prisma } from '$lib/prisma/client';

// The catalog (manufacturers, products, categories, per-org prices) is shared
// state that several orgs can write to, so every mutation is logged — the
// AssetTransaction idea applied to catalog rows. References are soft strings
// because merges delete their source rows and the log must outlive them.

export type CatalogAction =
	| 'PRODUCT_UPDATED'
	| 'PRODUCT_DELETED'
	| 'PRODUCT_MERGED'
	| 'PRODUCT_PRICE_SET'
	| 'MANUFACTURER_UPDATED'
	| 'MANUFACTURER_MERGED'
	| 'CATEGORY_UPDATED';

export async function logCatalogChange(entry: {
	userId: string;
	action: CatalogAction;
	productId?: string;
	manufacturerId?: string;
	categoryId?: string;
	organizationId?: string;
	data?: Prisma.InputJsonValue;
}) {
	await prisma.catalogTransaction.create({
		data: {
			userId: entry.userId,
			action: entry.action,
			productId: entry.productId ?? null,
			manufacturerId: entry.manufacturerId ?? null,
			categoryId: entry.categoryId ?? null,
			organizationId: entry.organizationId ?? null,
			data: entry.data
		}
	});
}

/**
 * The `changes` payload most log entries carry: one row per field that
 * actually moved, with both sides — the shape the asset history UI already
 * renders for AssetTransaction.
 */
type FieldChange = { [key: string]: Prisma.InputJsonValue | null };

export function fieldChanges<T extends Record<string, unknown>>(
	before: T,
	after: Partial<T>
): FieldChange[] {
	const changes: FieldChange[] = [];
	for (const key of Object.keys(after)) {
		const from = before[key] ?? null;
		const to = after[key] ?? null;
		if (String(from) !== String(to)) {
			changes.push({
				field: key,
				from: from as Prisma.InputJsonValue | null,
				to: to as Prisma.InputJsonValue | null
			});
		}
	}
	return changes;
}
