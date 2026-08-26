-- Product snapshot on billing lines, so units of the same product can be shown
-- as one quantity line without inspecting the asset they were priced from.
ALTER TABLE "OfferItem" ADD COLUMN "productId" TEXT;
ALTER TABLE "OfferItem" ADD COLUMN "productLabel" TEXT;
ALTER TABLE "InvoiceItem" ADD COLUMN "productId" TEXT;
ALTER TABLE "InvoiceItem" ADD COLUMN "productLabel" TEXT;

-- Backfill from the asset each line was priced from. Lines whose asset is gone
-- (or bundle lines, which have no assetId) keep NULL and stay ungrouped, which
-- is exactly how they rendered before.
UPDATE "OfferItem" oi
SET "productId" = a."productId",
    "productLabel" = m."name" || ' ' || p."name"
FROM "Asset" a
JOIN "Product" p ON p."id" = a."productId"
JOIN "Manufacturer" m ON m."id" = p."manufacturerId"
WHERE oi."assetId" = a."id";

UPDATE "InvoiceItem" ii
SET "productId" = a."productId",
    "productLabel" = m."name" || ' ' || p."name"
FROM "Asset" a
JOIN "Product" p ON p."id" = a."productId"
JOIN "Manufacturer" m ON m."id" = p."manufacturerId"
WHERE ii."assetId" = a."id";
