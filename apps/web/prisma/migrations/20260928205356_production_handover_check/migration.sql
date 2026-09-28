-- AlterTable
ALTER TABLE "ProductionItem" ADD COLUMN     "receivedAt" TIMESTAMP(3),
ADD COLUMN     "receivedById" TEXT,
ADD COLUMN     "returnReportedAt" TIMESTAMP(3),
ADD COLUMN     "returnReportedById" TEXT;

-- CreateTable
CREATE TABLE "ProductionCheck" (
    "id" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdById" TEXT,
    "closedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionCheckTick" (
    "id" TEXT NOT NULL,
    "checkId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "userId" TEXT,
    "via" TEXT NOT NULL,
    "unexpected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionCheckTick_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductionCheck_productionId_organizationId_status_idx" ON "ProductionCheck"("productionId", "organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionCheckTick_checkId_assetId_key" ON "ProductionCheckTick"("checkId", "assetId");

-- AddForeignKey
ALTER TABLE "ProductionItem" ADD CONSTRAINT "ProductionItem_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionItem" ADD CONSTRAINT "ProductionItem_returnReportedById_fkey" FOREIGN KEY ("returnReportedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionCheck" ADD CONSTRAINT "ProductionCheck_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "Production"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionCheck" ADD CONSTRAINT "ProductionCheck_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionCheck" ADD CONSTRAINT "ProductionCheck_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionCheck" ADD CONSTRAINT "ProductionCheck_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionCheckTick" ADD CONSTRAINT "ProductionCheckTick_checkId_fkey" FOREIGN KEY ("checkId") REFERENCES "ProductionCheck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionCheckTick" ADD CONSTRAINT "ProductionCheckTick_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionCheckTick" ADD CONSTRAINT "ProductionCheckTick_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
