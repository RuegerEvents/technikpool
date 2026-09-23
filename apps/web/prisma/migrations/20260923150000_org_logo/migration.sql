-- A letterhead logo per organization, snapshotted onto offers and invoices
-- like the rest of the letterhead.

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "logoPath" TEXT;

-- AlterTable
ALTER TABLE "Offer" ADD COLUMN     "orgLogoPath" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "orgLogoPath" TEXT;
