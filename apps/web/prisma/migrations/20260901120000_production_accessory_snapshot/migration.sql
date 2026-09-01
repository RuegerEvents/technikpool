ALTER TABLE "ProductionItem" ADD COLUMN "sourceParentAssetId" TEXT;

UPDATE "ProductionItem" AS item
SET "sourceParentAssetId" = asset."parentAssetId"
FROM "Asset" AS asset
WHERE item."assetId" = asset."id"
  AND asset."parentAssetId" IS NOT NULL;
