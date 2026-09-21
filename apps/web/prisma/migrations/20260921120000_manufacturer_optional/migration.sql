-- A product with no maker had to be filed under a stand-in "Generisch"
-- manufacturer. It now simply has none.
ALTER TABLE "Product" ALTER COLUMN "manufacturerId" DROP NOT NULL;

UPDATE "Product" SET "manufacturerId" = NULL
WHERE "manufacturerId" IN (SELECT "id" FROM "Manufacturer" WHERE "generic");

DELETE FROM "Manufacturer" WHERE "generic";

ALTER TABLE "Manufacturer" DROP COLUMN "generic";
