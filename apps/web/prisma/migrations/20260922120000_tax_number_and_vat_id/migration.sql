-- One "tax ID" field held either the Steuernummer or the USt-IdNr., and every
-- document printed it as "USt-IdNr.". They are two numbers and an invoice may
-- carry both, so each gets a column. The old value is sorted by its shape: a
-- USt-IdNr. starts with a country code (DE…), a Steuernummer never does.

ALTER TABLE "Organization" ADD COLUMN "taxNumber" TEXT, ADD COLUMN "vatId" TEXT;
UPDATE "Organization" SET "vatId" = btrim("taxId")
WHERE btrim("taxId") ~ '^[A-Za-z]{2}';
UPDATE "Organization" SET "taxNumber" = btrim("taxId")
WHERE btrim("taxId") <> '' AND btrim("taxId") !~ '^[A-Za-z]{2}';
ALTER TABLE "Organization" DROP COLUMN "taxId";

ALTER TABLE "Offer" ADD COLUMN "orgTaxNumber" TEXT, ADD COLUMN "orgVatId" TEXT;
UPDATE "Offer" SET "orgVatId" = btrim("orgTaxId")
WHERE btrim("orgTaxId") ~ '^[A-Za-z]{2}';
UPDATE "Offer" SET "orgTaxNumber" = btrim("orgTaxId")
WHERE btrim("orgTaxId") <> '' AND btrim("orgTaxId") !~ '^[A-Za-z]{2}';
ALTER TABLE "Offer" DROP COLUMN "orgTaxId";

ALTER TABLE "Invoice" ADD COLUMN "orgTaxNumber" TEXT, ADD COLUMN "orgVatId" TEXT;
UPDATE "Invoice" SET "orgVatId" = btrim("orgTaxId")
WHERE btrim("orgTaxId") ~ '^[A-Za-z]{2}';
UPDATE "Invoice" SET "orgTaxNumber" = btrim("orgTaxId")
WHERE btrim("orgTaxId") <> '' AND btrim("orgTaxId") !~ '^[A-Za-z]{2}';
ALTER TABLE "Invoice" DROP COLUMN "orgTaxId";
