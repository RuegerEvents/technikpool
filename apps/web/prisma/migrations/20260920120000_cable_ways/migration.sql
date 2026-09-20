-- A loom carries two or more pairs of ends in one cable — 6× Schuko plus a DMX
-- way, a hybrid's power plus data. One row per shape, with a count: "6× Schuko
-- M→F" is a number, not six rows. The ends stay free text like
-- Product.connectorA/B, so registering a loom never stalls on the connector
-- catalogue.
CREATE TABLE "CableWay" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "connectorA" TEXT,
    "connectorB" TEXT,
    "cableType" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CableWay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CableWay_productId_idx" ON "CableWay"("productId");

-- AddForeignKey
ALTER TABLE "CableWay" ADD CONSTRAINT "CableWay_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
