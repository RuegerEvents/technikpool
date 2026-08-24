-- AlterTable: add nullable first so existing rows can be backfilled
ALTER TABLE "public"."Organization" ADD COLUMN "assetIdPrefix" TEXT;

-- Assign sequential placeholder prefixes to existing orgs (e.g. 001, 002, ...)
-- These should be updated via the UI before creating any assets.
DO $$
DECLARE
  r RECORD;
  i INT := 1;
BEGIN
  FOR r IN SELECT id FROM "public"."Organization" ORDER BY "createdAt" LOOP
    UPDATE "public"."Organization"
    SET "assetIdPrefix" = LPAD(i::TEXT, 3, '0')
    WHERE id = r.id;
    i := i + 1;
  END LOOP;
END $$;

-- Now enforce NOT NULL
ALTER TABLE "public"."Organization" ALTER COLUMN "assetIdPrefix" SET NOT NULL;

-- CreateIndex: unique prefix per organization
CREATE UNIQUE INDEX "Organization_assetIdPrefix_key" ON "public"."Organization"("assetIdPrefix");

-- AlterTable: add human-readable asset ID to assets
ALTER TABLE "public"."Asset" ADD COLUMN "assetId" TEXT;

-- CreateIndex: globally unique asset ID
CREATE UNIQUE INDEX "Asset_assetId_key" ON "public"."Asset"("assetId");
