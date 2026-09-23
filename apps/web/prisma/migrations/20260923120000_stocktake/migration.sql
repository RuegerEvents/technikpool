-- Stocktakes (Inventur): a snapshot of what an org should have, and what was counted.

-- CreateTable
CREATE TABLE "Stocktake" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "scope" JSONB NOT NULL,
    "recountOfId" TEXT,
    "appliedActions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdById" TEXT NOT NULL,
    "closedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Stocktake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StocktakeItem" (
    "id" TEXT NOT NULL,
    "stocktakeId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "expected" BOOLEAN NOT NULL,
    "expectedLocationId" TEXT,
    "outProductionId" TEXT,
    "outProductionName" TEXT,
    "unexpectedReason" TEXT,
    "foundAt" TIMESTAMP(3),
    "foundById" TEXT,
    "foundLocationId" TEXT,
    "foundVia" TEXT,
    "note" TEXT,
    "needsAttention" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "StocktakeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StocktakeLine" (
    "id" TEXT NOT NULL,
    "stocktakeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "expected" INTEGER NOT NULL,
    "out" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StocktakeLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StocktakeCount" (
    "id" TEXT NOT NULL,
    "stocktakeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StocktakeCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StocktakeEvent" (
    "id" TEXT NOT NULL,
    "stocktakeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "assetId" TEXT,
    "productId" TEXT,
    "locationId" TEXT,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StocktakeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Stocktake_organizationId_status_idx" ON "Stocktake"("organizationId", "status");

-- CreateIndex
CREATE INDEX "StocktakeItem_assetId_idx" ON "StocktakeItem"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "StocktakeItem_stocktakeId_assetId_key" ON "StocktakeItem"("stocktakeId", "assetId");

-- CreateIndex
CREATE UNIQUE INDEX "StocktakeLine_stocktakeId_productId_locationId_key" ON "StocktakeLine"("stocktakeId", "productId", "locationId");

-- CreateIndex
CREATE UNIQUE INDEX "StocktakeCount_stocktakeId_productId_locationId_userId_key" ON "StocktakeCount"("stocktakeId", "productId", "locationId", "userId");

-- CreateIndex
CREATE INDEX "StocktakeEvent_stocktakeId_createdAt_idx" ON "StocktakeEvent"("stocktakeId", "createdAt");

-- AddForeignKey
ALTER TABLE "Stocktake" ADD CONSTRAINT "Stocktake_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stocktake" ADD CONSTRAINT "Stocktake_recountOfId_fkey" FOREIGN KEY ("recountOfId") REFERENCES "Stocktake"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stocktake" ADD CONSTRAINT "Stocktake_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stocktake" ADD CONSTRAINT "Stocktake_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StocktakeItem" ADD CONSTRAINT "StocktakeItem_stocktakeId_fkey" FOREIGN KEY ("stocktakeId") REFERENCES "Stocktake"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StocktakeItem" ADD CONSTRAINT "StocktakeItem_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StocktakeItem" ADD CONSTRAINT "StocktakeItem_expectedLocationId_fkey" FOREIGN KEY ("expectedLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StocktakeItem" ADD CONSTRAINT "StocktakeItem_foundById_fkey" FOREIGN KEY ("foundById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StocktakeItem" ADD CONSTRAINT "StocktakeItem_foundLocationId_fkey" FOREIGN KEY ("foundLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StocktakeLine" ADD CONSTRAINT "StocktakeLine_stocktakeId_fkey" FOREIGN KEY ("stocktakeId") REFERENCES "Stocktake"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StocktakeLine" ADD CONSTRAINT "StocktakeLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StocktakeLine" ADD CONSTRAINT "StocktakeLine_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StocktakeCount" ADD CONSTRAINT "StocktakeCount_stocktakeId_fkey" FOREIGN KEY ("stocktakeId") REFERENCES "Stocktake"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StocktakeCount" ADD CONSTRAINT "StocktakeCount_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StocktakeCount" ADD CONSTRAINT "StocktakeCount_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StocktakeCount" ADD CONSTRAINT "StocktakeCount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StocktakeEvent" ADD CONSTRAINT "StocktakeEvent_stocktakeId_fkey" FOREIGN KEY ("stocktakeId") REFERENCES "Stocktake"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StocktakeEvent" ADD CONSTRAINT "StocktakeEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

