-- The customer's address as separate fields on the invoice, which the e-invoice
-- (EN 16931, BG-8) needs: street, postal code, city and country each in its own
-- element. "customerAddress" stays as the printed block.
ALTER TABLE "Invoice"
ADD COLUMN "customerAddressLine1" TEXT,
ADD COLUMN "customerAddressLine2" TEXT,
ADD COLUMN "customerPostalCode" TEXT,
ADD COLUMN "customerCity" TEXT,
ADD COLUMN "customerCountry" TEXT NOT NULL DEFAULT 'DE';

-- Drafts take the address their customer (or recipient org) has now. A sent
-- invoice is left alone: today's address is not the one it was issued to.
UPDATE "Invoice" i
SET "customerAddressLine1" = a."line1",
    "customerAddressLine2" = a."line2",
    "customerPostalCode" = a."postalCode",
    "customerCity" = a."city"
FROM "Customer" c
JOIN "Address" a ON a."id" = c."addressId"
WHERE i."sentAt" IS NULL AND i."customerId" = c."id";

UPDATE "Invoice" i
SET "customerAddressLine1" = a."line1",
    "customerAddressLine2" = a."line2",
    "customerPostalCode" = a."postalCode",
    "customerCity" = a."city"
FROM "Organization" o
JOIN "Address" a ON a."id" = o."addressId"
WHERE i."sentAt" IS NULL
  AND i."customerId" IS NULL
  AND i."recipientOrganizationId" = o."id";
