-- Collective lines and hidden 0,00 € lines on offers and invoices.
ALTER TABLE "Offer" ADD COLUMN "lineGroups" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "hideZeroLines" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Invoice" ADD COLUMN "lineGroups" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "hideZeroLines" BOOLEAN NOT NULL DEFAULT true;

-- A document already issued prints again as it was issued (the offer to sign,
-- a re-rendered preview): its 0,00 € lines stay on it.
UPDATE "Offer" SET "hideZeroLines" = false WHERE "finalizedAt" IS NOT NULL;
UPDATE "Invoice" SET "hideZeroLines" = false WHERE "sentAt" IS NOT NULL OR "pdfPath" IS NOT NULL;
