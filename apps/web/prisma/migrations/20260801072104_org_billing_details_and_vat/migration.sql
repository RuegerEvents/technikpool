-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "vatRatePercent" DECIMAL(4,2) NOT NULL DEFAULT 19;

-- AlterTable
ALTER TABLE "Offer" ADD COLUMN     "vatRatePercent" DECIMAL(4,2) NOT NULL DEFAULT 19;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "addressId" TEXT,
ADD COLUMN     "bankAccountHolder" TEXT,
ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "bic" TEXT,
ADD COLUMN     "iban" TEXT,
ADD COLUMN     "taxId" TEXT;

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

