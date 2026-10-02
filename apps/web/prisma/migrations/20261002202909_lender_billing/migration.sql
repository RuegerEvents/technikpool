-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "recipientOrganizationId" TEXT;

-- AlterTable
ALTER TABLE "Offer" ADD COLUMN     "recipientOrganizationId" TEXT;

-- CreateTable
CREATE TABLE "BillingDismissal" (
    "id" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dismissedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingDismissal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillingDismissal_productionId_organizationId_key" ON "BillingDismissal"("productionId", "organizationId");

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_recipientOrganizationId_fkey" FOREIGN KEY ("recipientOrganizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_recipientOrganizationId_fkey" FOREIGN KEY ("recipientOrganizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingDismissal" ADD CONSTRAINT "BillingDismissal_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "Production"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingDismissal" ADD CONSTRAINT "BillingDismissal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingDismissal" ADD CONSTRAINT "BillingDismissal_dismissedById_fkey" FOREIGN KEY ("dismissedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
