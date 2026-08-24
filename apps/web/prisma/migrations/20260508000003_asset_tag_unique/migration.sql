-- Drop the assetId column (merged into assetTag)
DROP INDEX IF EXISTS "Asset_assetId_key";
ALTER TABLE "public"."Asset" DROP COLUMN IF EXISTS "assetId";

-- Null out duplicate assetTag values before adding unique constraint
-- (keeps the first occurrence per value, nulls the rest)
UPDATE "public"."Asset" a
SET "assetTag" = NULL
WHERE ctid NOT IN (
  SELECT min(ctid)
  FROM "public"."Asset"
  WHERE "assetTag" IS NOT NULL
  GROUP BY "assetTag"
);

-- CreateIndex: assetTag is now the globally unique asset identifier
CREATE UNIQUE INDEX "Asset_assetTag_key" ON "public"."Asset"("assetTag");
