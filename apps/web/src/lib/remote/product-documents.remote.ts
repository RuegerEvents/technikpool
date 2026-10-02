import { query, command } from '$app/server';
import * as v from 'valibot';
import { prisma } from '#lib/server/auth.js';
import { deleteObject } from '#lib/server/storage.js';
import { isSystemAdmin, managedOrgIds, requireAuth } from '#lib/server/services/access.js';
import { productControl } from '#lib/server/services/product-control.js';
import { logCatalogChange } from '#lib/server/services/catalog-log.js';
import {
	canAddDocuments,
	canChangeDocument,
	DOCUMENT_PREFIX,
	MAX_DOCUMENT_BYTES,
	productDocuments
} from '#lib/server/services/product-documents.js';
import { appError } from '#lib/errors.js';

// A product's PDFs — see src/lib/server/services/product-documents.ts for why
// they are public and who may change them.

const kindSchema = v.picklist(['MANUAL', 'DATASHEET', 'OTHER']);
const titleSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200));

/** A product's documents, each with whether the caller may change it. */
export const getProductDocuments = query(v.string(), async (productId: string) => {
	const user = await requireAuth();
	const product = await prisma.product.findUniqueOrThrow({
		where: { id: productId },
		select: { id: true, createdById: true }
	});
	const systemAdmin = await isSystemAdmin(user.id);
	const managed = systemAdmin ? [] : await managedOrgIds(user.id);
	// Once for the product, not per document: the rule is the product's.
	const controls =
		(systemAdmin || managed.length > 0) &&
		(await productControl({ id: user.id, systemAdmin, managed }, product)).allowed;
	const [documents, canAdd] = await Promise.all([
		productDocuments(productId),
		canAddDocuments(user.id)
	]);
	return {
		canAdd,
		documents: documents.map(({ uploadedById, ...document }) => ({
			...document,
			canChange: controls || uploadedById === user.id
		}))
	};
});

export const addProductDocument = command(
	v.object({
		productId: v.string(),
		path: v.string(),
		sizeBytes: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(MAX_DOCUMENT_BYTES)),
		title: titleSchema,
		kind: kindSchema
	}),
	async ({ productId, path, sizeBytes, title, kind }) => {
		const user = await requireAuth();
		if (!(await canAddDocuments(user.id))) appError(403, 'product_edit_forbidden');
		// Only what the upload route wrote: a document pointing anywhere else in
		// the bucket would publish whatever lives there.
		if (!path.startsWith(DOCUMENT_PREFIX) || !path.endsWith('.pdf') || path.includes('..')) {
			appError(400, 'product_document_invalid');
		}
		const document = await prisma.productDocument.create({
			data: { productId, path, sizeBytes, title, kind, uploadedById: user.id }
		});
		await logCatalogChange({
			userId: user.id,
			action: 'PRODUCT_DOCUMENT_ADDED',
			productId,
			data: { document: { title, kind, path } }
		});
		await getProductDocuments(productId).refresh();
		return document;
	}
);

export const updateProductDocument = command(
	v.object({ documentId: v.string(), title: titleSchema, kind: kindSchema }),
	async ({ documentId, title, kind }) => {
		const user = await requireAuth();
		const document = await prisma.productDocument.findUniqueOrThrow({
			where: { id: documentId },
			include: { product: { select: { id: true, createdById: true } } }
		});
		if (!(await canChangeDocument(user.id, document))) appError(403, 'product_document_forbidden');
		await prisma.productDocument.update({ where: { id: documentId }, data: { title, kind } });
		await getProductDocuments(document.productId).refresh();
	}
);

export const removeProductDocument = command(v.string(), async (documentId: string) => {
	const user = await requireAuth();
	const document = await prisma.productDocument.findUniqueOrThrow({
		where: { id: documentId },
		include: { product: { select: { id: true, createdById: true } } }
	});
	if (!(await canChangeDocument(user.id, document))) appError(403, 'product_document_forbidden');
	await prisma.productDocument.delete({ where: { id: documentId } });
	// The row is what anyone finds it by; a file left behind is only storage.
	await deleteObject(document.path).catch((error) =>
		console.error(`Could not delete "${document.path}" from the object store:`, error)
	);
	await logCatalogChange({
		userId: user.id,
		action: 'PRODUCT_DOCUMENT_REMOVED',
		productId: document.productId,
		data: { document: { title: document.title, kind: document.kind, path: document.path } }
	});
	await getProductDocuments(document.productId).refresh();
});
