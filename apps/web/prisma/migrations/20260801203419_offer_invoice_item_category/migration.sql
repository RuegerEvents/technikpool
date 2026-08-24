-- AlterTable
ALTER TABLE "InvoiceItem" ADD COLUMN     "categoryColor" TEXT,
ADD COLUMN     "categoryId" TEXT,
ADD COLUMN     "categoryName" TEXT;

-- AlterTable
ALTER TABLE "OfferItem" ADD COLUMN     "categoryColor" TEXT,
ADD COLUMN     "categoryId" TEXT,
ADD COLUMN     "categoryName" TEXT;
