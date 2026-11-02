-- DropForeignKey
ALTER TABLE "Asset" DROP CONSTRAINT "Asset_locationId_fkey";

-- DropForeignKey
ALTER TABLE "CableWay" DROP CONSTRAINT "CableWay_connectorAId_fkey";

-- DropForeignKey
ALTER TABLE "CableWay" DROP CONSTRAINT "CableWay_connectorBId_fkey";

-- DropForeignKey
ALTER TABLE "Location" DROP CONSTRAINT "Location_addressId_fkey";

-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_connectorAId_fkey";

-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_connectorBId_fkey";

-- DropForeignKey
ALTER TABLE "ProductPort" DROP CONSTRAINT "ProductPort_connectorId_fkey";

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "rentalTermsVersionId" TEXT;

-- AlterTable
ALTER TABLE "LoanRequest" ADD COLUMN     "rentalTermsAcceptanceId" TEXT;

-- AlterTable
ALTER TABLE "Offer" ADD COLUMN     "rentalTermsVersionId" TEXT;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "rentalTermsVersionId" TEXT;

-- CreateTable
CREATE TABLE "RentalTermsVersion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RentalTermsVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RentalTermsAcceptance" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "organizationId" TEXT,
    "orgName" TEXT NOT NULL,
    "lenderName" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RentalTermsAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RentalTermsVersion_organizationId_createdAt_idx" ON "RentalTermsVersion"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "RentalTermsAcceptance_organizationId_versionId_idx" ON "RentalTermsAcceptance"("organizationId", "versionId");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_rentalTermsVersionId_key" ON "Organization"("rentalTermsVersionId");

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_rentalTermsVersionId_fkey" FOREIGN KEY ("rentalTermsVersionId") REFERENCES "RentalTermsVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPort" ADD CONSTRAINT "ProductPort_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "Connector"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CableWay" ADD CONSTRAINT "CableWay_connectorAId_fkey" FOREIGN KEY ("connectorAId") REFERENCES "Connector"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CableWay" ADD CONSTRAINT "CableWay_connectorBId_fkey" FOREIGN KEY ("connectorBId") REFERENCES "Connector"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_connectorAId_fkey" FOREIGN KEY ("connectorAId") REFERENCES "Connector"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_connectorBId_fkey" FOREIGN KEY ("connectorBId") REFERENCES "Connector"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanRequest" ADD CONSTRAINT "LoanRequest_rentalTermsAcceptanceId_fkey" FOREIGN KEY ("rentalTermsAcceptanceId") REFERENCES "RentalTermsAcceptance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalTermsVersion" ADD CONSTRAINT "RentalTermsVersion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalTermsVersion" ADD CONSTRAINT "RentalTermsVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalTermsAcceptance" ADD CONSTRAINT "RentalTermsAcceptance_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "RentalTermsVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalTermsAcceptance" ADD CONSTRAINT "RentalTermsAcceptance_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalTermsAcceptance" ADD CONSTRAINT "RentalTermsAcceptance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_rentalTermsVersionId_fkey" FOREIGN KEY ("rentalTermsVersionId") REFERENCES "RentalTermsVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_rentalTermsVersionId_fkey" FOREIGN KEY ("rentalTermsVersionId") REFERENCES "RentalTermsVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

