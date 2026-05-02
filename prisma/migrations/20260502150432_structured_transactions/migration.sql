/*
  Warnings:

  - You are about to drop the column `notes` on the `AssetTransaction` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "AssetTransaction" DROP CONSTRAINT "AssetTransaction_productionId_fkey";

-- AlterTable
ALTER TABLE "AssetTransaction" DROP COLUMN "notes",
ADD COLUMN     "data" JSONB;

-- AddForeignKey
ALTER TABLE "AssetTransaction" ADD CONSTRAINT "AssetTransaction_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "Production"("id") ON DELETE SET NULL ON UPDATE CASCADE;
