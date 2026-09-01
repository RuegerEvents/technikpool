-- ── Per-organization product pricing ─────────────────────────────────────────
-- Product.netPurchasePrice was global: any org admin could silently reprice
-- every other org's future offers. The price moves to (organization, product).

CREATE TABLE "OrgProductPrice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "netPurchasePrice" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgProductPrice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrgProductPrice_organizationId_productId_key"
ON "OrgProductPrice"("organizationId", "productId");

ALTER TABLE "OrgProductPrice"
ADD CONSTRAINT "OrgProductPrice_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrgProductPrice"
ADD CONSTRAINT "OrgProductPrice_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Every org that owns units of a priced product keeps the price it had.
INSERT INTO "OrgProductPrice" ("id", "organizationId", "productId", "netPurchasePrice", "createdAt", "updatedAt")
SELECT
    'opp_' || replace(gen_random_uuid()::text, '-', ''),
    owner."organizationId",
    p."id",
    p."netPurchasePrice",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Product" p
JOIN (SELECT DISTINCT "organizationId", "productId" FROM "Asset") owner
    ON owner."productId" = p."id"
WHERE p."netPurchasePrice" IS NOT NULL;

ALTER TABLE "Product" DROP COLUMN "netPurchasePrice";

-- ── Offer numbering: automatic, per org and year ─────────────────────────────

ALTER TABLE "Offer" ADD COLUMN "number" TEXT;

UPDATE "Offer"
SET "number" = numbered."number"
FROM (
    SELECT
        "id",
        'A-' || to_char("createdAt", 'YYYY') || '-' ||
        lpad((row_number() OVER (
            PARTITION BY "organizationId", date_part('year', "createdAt")
            ORDER BY "createdAt", "id"
        ))::text, 4, '0') AS "number"
    FROM "Offer"
) numbered
WHERE "Offer"."id" = numbered."id";

ALTER TABLE "Offer" ALTER COLUMN "number" SET NOT NULL;

CREATE UNIQUE INDEX "Offer_organizationId_number_key" ON "Offer"("organizationId", "number");

CREATE TABLE "OfferSequence" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OfferSequence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OfferSequence_organizationId_year_key"
ON "OfferSequence"("organizationId", "year");

ALTER TABLE "OfferSequence"
ADD CONSTRAINT "OfferSequence_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed each counter with what the backfill above already handed out.
INSERT INTO "OfferSequence" ("id", "organizationId", "year", "lastNumber")
SELECT
    'ofsq_' || replace(gen_random_uuid()::text, '-', ''),
    "organizationId",
    date_part('year', "createdAt")::int,
    count(*)::int
FROM "Offer"
GROUP BY "organizationId", date_part('year', "createdAt");

-- ── Invoice numbering: manual, unique per org instead of globally ────────────
-- The global counter both leaked tenants' invoice volume into each other's
-- number gaps and stopped an org from following its own external scheme.

DROP INDEX "Invoice_number_key";
CREATE UNIQUE INDEX "Invoice_organizationId_number_key" ON "Invoice"("organizationId", "number");

DROP TABLE "InvoiceSequence";

-- ── Issuing-org snapshot on offers and invoices ──────────────────────────────
-- Documents render from these columns; the live Organization row is only used
-- for access control from here on.

ALTER TABLE "Offer"
ADD COLUMN "isKleinunternehmerSnapshot" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "orgName" TEXT,
ADD COLUMN "orgAddressLine1" TEXT,
ADD COLUMN "orgAddressLine2" TEXT,
ADD COLUMN "orgPostalCode" TEXT,
ADD COLUMN "orgCity" TEXT,
ADD COLUMN "orgTaxId" TEXT,
ADD COLUMN "orgBillingEmail" TEXT,
ADD COLUMN "orgBillingWebsite" TEXT,
ADD COLUMN "orgBankAccountHolder" TEXT,
ADD COLUMN "orgBankName" TEXT,
ADD COLUMN "orgIban" TEXT,
ADD COLUMN "orgBic" TEXT;

ALTER TABLE "Invoice"
ADD COLUMN "orgName" TEXT,
ADD COLUMN "orgAddressLine1" TEXT,
ADD COLUMN "orgAddressLine2" TEXT,
ADD COLUMN "orgPostalCode" TEXT,
ADD COLUMN "orgCity" TEXT,
ADD COLUMN "orgTaxId" TEXT,
ADD COLUMN "orgBillingEmail" TEXT,
ADD COLUMN "orgBillingWebsite" TEXT,
ADD COLUMN "orgBankAccountHolder" TEXT,
ADD COLUMN "orgBankName" TEXT,
ADD COLUMN "orgIban" TEXT,
ADD COLUMN "orgBic" TEXT;

-- Existing documents get today's org data — the best available approximation
-- of what they were created with.
UPDATE "Offer" o
SET "isKleinunternehmerSnapshot" = (o."vatRatePercent" = 0),
    "orgName" = org."name",
    "orgAddressLine1" = a."line1",
    "orgAddressLine2" = a."line2",
    "orgPostalCode" = a."postalCode",
    "orgCity" = a."city",
    "orgTaxId" = org."taxId",
    "orgBillingEmail" = org."billingEmail",
    "orgBillingWebsite" = org."billingWebsite",
    "orgBankAccountHolder" = org."bankAccountHolder",
    "orgBankName" = org."bankName",
    "orgIban" = org."iban",
    "orgBic" = org."bic"
FROM "Organization" org
LEFT JOIN "Address" a ON a."id" = org."addressId"
WHERE o."organizationId" = org."id";

UPDATE "Invoice" i
SET "orgName" = org."name",
    "orgAddressLine1" = a."line1",
    "orgAddressLine2" = a."line2",
    "orgPostalCode" = a."postalCode",
    "orgCity" = a."city",
    "orgTaxId" = org."taxId",
    "orgBillingEmail" = org."billingEmail",
    "orgBillingWebsite" = org."billingWebsite",
    "orgBankAccountHolder" = org."bankAccountHolder",
    "orgBankName" = org."bankName",
    "orgIban" = org."iban",
    "orgBic" = org."bic"
FROM "Organization" org
LEFT JOIN "Address" a ON a."id" = org."addressId"
WHERE i."organizationId" = org."id";

ALTER TABLE "Offer" ALTER COLUMN "orgName" SET NOT NULL;
ALTER TABLE "Invoice" ALTER COLUMN "orgName" SET NOT NULL;

-- ── Catalog audit log ────────────────────────────────────────────────────────

CREATE TABLE "CatalogTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "productId" TEXT,
    "manufacturerId" TEXT,
    "categoryId" TEXT,
    "organizationId" TEXT,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogTransaction_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CatalogTransaction"
ADD CONSTRAINT "CatalogTransaction_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
