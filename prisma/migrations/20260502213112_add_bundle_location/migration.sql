-- AlterTable
ALTER TABLE "AssetBundle" ADD COLUMN     "locationId" TEXT;

-- AddForeignKey
ALTER TABLE "AssetBundle" ADD CONSTRAINT "AssetBundle_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
