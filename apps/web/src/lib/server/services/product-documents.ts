import { prisma } from '#lib/server/auth.js';
import { PUBLIC_PREFIX } from '#lib/server/storage.js';
import { isSystemAdmin, managedOrgIds, writableOrgIds } from './access';
import { productControl } from './product-control';

// PDFs that come with a product: its manual, its datasheet, a declaration of
// conformity. They sit beside the product's picture under the object store's
// public prefix, because the product is part of the catalogue every org shares
// — and because a customer's info link has to be able to hand them out with
// nobody signed in. So a document is public by construction: whoever has the
// address can read it, and nothing private (a wiring plan with the venue's
// network, a price list) may ever be uploaded as one. The upload form says so.
//
// Rights follow the picture's: adding one is a contribution any MEMBER+ of any
// org may make, like a first picture; taking one away answers to
// `productControl` like replacing a picture does — or to whoever added it.

/** Where uploaded documents are written, and the only keys a document may point at. */
export const DOCUMENT_PREFIX = `${PUBLIC_PREFIX}/documents/`;

/** Big enough for a scanned manual, small enough that nobody stores videos in it. */
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

/** Whether the user may add documents to the catalogue at all. */
export async function canAddDocuments(userId: string) {
	return (await isSystemAdmin(userId)) || (await writableOrgIds(userId)).length > 0;
}

/** Whether the user may remove or edit this document. */
export async function canChangeDocument(
	userId: string,
	document: { uploadedById: string | null; product: { id: string; createdById: string | null } }
) {
	if (document.uploadedById === userId) return true;
	const systemAdmin = await isSystemAdmin(userId);
	const managed = systemAdmin ? [] : await managedOrgIds(userId);
	if (!systemAdmin && managed.length === 0) return false;
	const control = await productControl({ id: userId, systemAdmin, managed }, document.product);
	return control.allowed;
}

/** A product's documents, manuals first, as every surface lists them. */
export function productDocuments(productId: string) {
	return prisma.productDocument.findMany({
		where: { productId },
		orderBy: [{ kind: 'asc' }, { title: 'asc' }],
		select: {
			id: true,
			kind: true,
			title: true,
			path: true,
			sizeBytes: true,
			uploadedById: true,
			createdAt: true
		}
	});
}
