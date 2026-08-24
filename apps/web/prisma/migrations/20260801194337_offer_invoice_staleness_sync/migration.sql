-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "assetScope" TEXT NOT NULL DEFAULT 'ALL',
ADD COLUMN     "sentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "InvoiceItem" ADD COLUMN     "bundleId" TEXT;

-- AlterTable
ALTER TABLE "Offer" ADD COLUMN     "assetScope" TEXT NOT NULL DEFAULT 'ALL';

-- AlterTable
ALTER TABLE "OfferItem" ADD COLUMN     "bundleId" TEXT;
