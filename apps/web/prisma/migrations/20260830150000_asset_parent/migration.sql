-- An accessory is an Asset attached to one parent Asset: its case, its power
-- cable, its brackets. One level deep — enforced in application code, since a
-- self-referencing FK can't express "a parent has no parent".

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "parentAssetId" TEXT;

-- CreateIndex
CREATE INDEX "Asset_parentAssetId_idx" ON "Asset"("parentAssetId");

-- AddForeignKey
-- SetNull rather than Cascade: deleting a parent must never take a real unit
-- (with its own inspection record and history) with it — the accessory is
-- simply loose again.
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_parentAssetId_fkey" FOREIGN KEY ("parentAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
