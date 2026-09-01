ALTER TABLE "Organization"
ADD COLUMN "billingEmail" TEXT,
ADD COLUMN "billingWebsite" TEXT,
ADD COLUMN "paymentTermsDays" INTEGER NOT NULL DEFAULT 14,
ADD COLUMN "offerIntroTemplate" TEXT,
ADD COLUMN "offerClosingTemplate" TEXT,
ADD COLUMN "invoiceIntroTemplate" TEXT,
ADD COLUMN "invoiceClosingTemplate" TEXT;

ALTER TABLE "Customer"
ADD COLUMN "customerNumber" TEXT,
ADD COLUMN "phone" TEXT,
ADD COLUMN "vatId" TEXT;

ALTER TABLE "Offer"
ADD COLUMN "customerNumber" TEXT,
ADD COLUMN "customerPhone" TEXT,
ADD COLUMN "customerVatId" TEXT,
ADD COLUMN "serviceStartDate" TIMESTAMP(3),
ADD COLUMN "serviceEndDate" TIMESTAMP(3),
ADD COLUMN "introText" TEXT,
ADD COLUMN "closingText" TEXT,
ADD COLUMN "paymentTermsDays" INTEGER NOT NULL DEFAULT 14;

ALTER TABLE "Invoice"
ADD COLUMN "customerNumber" TEXT,
ADD COLUMN "customerPhone" TEXT,
ADD COLUMN "customerVatId" TEXT,
ADD COLUMN "serviceStartDate" TIMESTAMP(3),
ADD COLUMN "serviceEndDate" TIMESTAMP(3),
ADD COLUMN "introText" TEXT,
ADD COLUMN "closingText" TEXT,
ADD COLUMN "paymentTermsDays" INTEGER NOT NULL DEFAULT 14;

CREATE UNIQUE INDEX "Customer_organizationId_customerNumber_key"
ON "Customer"("organizationId", "customerNumber");
