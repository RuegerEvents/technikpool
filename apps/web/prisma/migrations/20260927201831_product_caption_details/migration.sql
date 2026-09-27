-- A caption and details on the catalogue entry rather than the unit: "16-Port
-- PoE switch" says what a USW-Pro-Max-16-PoE is for every unit of it, and a
-- kit type the same for every case built to it.
ALTER TABLE "Product" ADD COLUMN "caption" TEXT,
ADD COLUMN "details" TEXT;

-- A kit type's one-line description becomes its details, text and all; the
-- caption is new.
ALTER TABLE "BundleTemplate" RENAME COLUMN "description" TO "details";
ALTER TABLE "BundleTemplate" ADD COLUMN "caption" TEXT;
