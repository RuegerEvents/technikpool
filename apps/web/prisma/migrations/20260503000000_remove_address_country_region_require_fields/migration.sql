-- Backfill NULLs before making columns required
UPDATE "Address" SET "line1" = '' WHERE "line1" IS NULL;
UPDATE "Address" SET "postalCode" = '' WHERE "postalCode" IS NULL;
UPDATE "Address" SET "city" = '' WHERE "city" IS NULL;

-- Make line1, postalCode, city required
ALTER TABLE "Address" ALTER COLUMN "line1" SET NOT NULL;
ALTER TABLE "Address" ALTER COLUMN "postalCode" SET NOT NULL;
ALTER TABLE "Address" ALTER COLUMN "city" SET NOT NULL;

-- Drop country and region columns
ALTER TABLE "Address" DROP COLUMN IF EXISTS "country";
ALTER TABLE "Address" DROP COLUMN IF EXISTS "region";
