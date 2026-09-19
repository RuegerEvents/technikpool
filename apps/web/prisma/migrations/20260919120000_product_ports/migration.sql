-- CreateTable
CREATE TABLE "ProductPort" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "label" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductPort_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductPort_productId_idx" ON "ProductPort"("productId");

-- CreateIndex
CREATE INDEX "ProductPort_connectorId_idx" ON "ProductPort"("connectorId");

-- AddForeignKey
ALTER TABLE "ProductPort" ADD CONSTRAINT "ProductPort_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPort" ADD CONSTRAINT "ProductPort_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "Connector"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

