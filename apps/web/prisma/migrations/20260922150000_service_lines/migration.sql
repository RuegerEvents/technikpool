-- Lines that are not rented equipment (Personal, Transport, Beratung …) on offers
-- and invoices, and the per-org price list they are picked from.

-- AlterTable
ALTER TABLE "OfferItem" ADD COLUMN     "categorySortOrder" INTEGER,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'EQUIPMENT',
ADD COLUMN     "note" TEXT,
ADD COLUMN     "perDay" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "quantity" DECIMAL(10,2),
ADD COLUMN     "serviceId" TEXT,
ADD COLUMN     "unit" TEXT,
ADD COLUMN     "unitPrice" DECIMAL(10,2),
ALTER COLUMN "netPurchasePrice" DROP NOT NULL,
ALTER COLUMN "ratePercent" DROP NOT NULL,
ALTER COLUMN "dailyRate" DROP NOT NULL;

-- AlterTable
ALTER TABLE "InvoiceItem" ADD COLUMN     "categorySortOrder" INTEGER,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'EQUIPMENT',
ADD COLUMN     "note" TEXT,
ADD COLUMN     "perDay" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "quantity" DECIMAL(10,2),
ADD COLUMN     "serviceId" TEXT,
ADD COLUMN     "unit" TEXT,
ADD COLUMN     "unitPrice" DECIMAL(10,2),
ALTER COLUMN "netPurchasePrice" DROP NOT NULL,
ALTER COLUMN "ratePercent" DROP NOT NULL,
ALTER COLUMN "dailyRate" DROP NOT NULL;

-- CreateTable
CREATE TABLE "ServiceCategory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#a1a1aa',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgService" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "perDay" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgService_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ServiceCategory" ADD CONSTRAINT "ServiceCategory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgService" ADD CONSTRAINT "OrgService_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgService" ADD CONSTRAINT "OrgService_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ServiceCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

