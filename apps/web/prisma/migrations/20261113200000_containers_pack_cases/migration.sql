-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "isContainer" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ProductionItem" ADD COLUMN     "packedInItemId" TEXT;

-- CreateIndex
CREATE INDEX "ProductionItem_packedInItemId_idx" ON "ProductionItem"("packedInItemId");

-- AddForeignKey
ALTER TABLE "ProductionItem" ADD CONSTRAINT "ProductionItem_packedInItemId_fkey" FOREIGN KEY ("packedInItemId") REFERENCES "ProductionItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
