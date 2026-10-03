-- Which e-invoice the archived PDF carries. Null for drafts and for invoices
-- sent as plain PDFs before e-invoicing, so the app never calls one an
-- e-invoice that is not.
ALTER TABLE "Invoice" ADD COLUMN "eInvoiceProfile" TEXT;
