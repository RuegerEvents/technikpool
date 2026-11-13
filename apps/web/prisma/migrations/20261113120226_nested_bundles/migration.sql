-- AlterTable
ALTER TABLE "AssetBundle" ADD COLUMN     "parentBundleId" TEXT;

-- CreateIndex
CREATE INDEX "AssetBundle_parentBundleId_idx" ON "AssetBundle"("parentBundleId");

-- AddForeignKey
ALTER TABLE "AssetBundle" ADD CONSTRAINT "AssetBundle_parentBundleId_fkey" FOREIGN KEY ("parentBundleId") REFERENCES "AssetBundle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
