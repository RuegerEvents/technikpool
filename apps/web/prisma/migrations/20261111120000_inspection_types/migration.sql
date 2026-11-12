-- Inspection types (Prüfarten): one shared list instead of the single DGUV V3
-- yes/no. A category's default, a product's override, an org's interval and a
-- unit's schedule are each per type now. See docs/plans/pruefarten.md.
--
-- Everything that existed becomes "electrical", except units in the Rigging
-- category that had an interval although their product did not need DGUV V3:
-- those were tracked as lifting equipment all along, so their schedule and
-- their inspections become "lifting", and their product says so.

-- CreateTable
CREATE TABLE "InspectionType" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameDe" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "failStatus" TEXT NOT NULL DEFAULT 'BROKEN',
    "requiresQualification" BOOLEAN NOT NULL DEFAULT true,
    "hasMeasurements" BOOLEAN NOT NULL DEFAULT false,
    "defaultIntervalMonths" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

CONSTRAINT "InspectionType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryInspectionType" (
    "categoryId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,

CONSTRAINT "CategoryInspectionType_pkey" PRIMARY KEY ("categoryId","typeId")
);

-- CreateTable
CREATE TABLE "ProductInspectionType" (
    "productId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL,

CONSTRAINT "ProductInspectionType_pkey" PRIMARY KEY ("productId","typeId")
);

-- CreateTable
CREATE TABLE "OrgInspectionInterval" (
    "organizationId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "months" INTEGER,

CONSTRAINT "OrgInspectionInterval_pkey" PRIMARY KEY ("organizationId","typeId")
);

-- CreateTable
CREATE TABLE "OrgProductInspectionInterval" (
    "organizationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "months" INTEGER NOT NULL,

    CONSTRAINT "OrgProductInspectionInterval_pkey" PRIMARY KEY ("organizationId","productId","typeId")
);

-- AddForeignKey
ALTER TABLE "OrgProductInspectionInterval" ADD CONSTRAINT "OrgProductInspectionInterval_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgProductInspectionInterval" ADD CONSTRAINT "OrgProductInspectionInterval_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgProductInspectionInterval" ADD CONSTRAINT "OrgProductInspectionInterval_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "InspectionType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "AssetInspectionSchedule" (
    "assetId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "intervalMonths" INTEGER NOT NULL,
    "overrideMonths" INTEGER,
    "nextDue" TIMESTAMP(3) NOT NULL,

CONSTRAINT "AssetInspectionSchedule_pkey" PRIMARY KEY ("assetId","typeId")
);

-- CreateIndex
CREATE UNIQUE INDEX "InspectionType_key_key" ON "InspectionType"("key");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionType_name_key" ON "InspectionType"("name");

-- CreateIndex
CREATE INDEX "AssetInspectionSchedule_typeId_nextDue_idx" ON "AssetInspectionSchedule"("typeId", "nextDue");

-- AddForeignKey
ALTER TABLE "CategoryInspectionType" ADD CONSTRAINT "CategoryInspectionType_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryInspectionType" ADD CONSTRAINT "CategoryInspectionType_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "InspectionType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductInspectionType" ADD CONSTRAINT "ProductInspectionType_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductInspectionType" ADD CONSTRAINT "ProductInspectionType_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "InspectionType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgInspectionInterval" ADD CONSTRAINT "OrgInspectionInterval_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgInspectionInterval" ADD CONSTRAINT "OrgInspectionInterval_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "InspectionType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetInspectionSchedule" ADD CONSTRAINT "AssetInspectionSchedule_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetInspectionSchedule" ADD CONSTRAINT "AssetInspectionSchedule_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "InspectionType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InspectionType" ALTER COLUMN "name" TYPE TEXT COLLATE "natural";

INSERT INTO "InspectionType" ("id", "key", "name", "nameDe", "sortOrder", "failStatus", "requiresQualification", "hasMeasurements", "defaultIntervalMonths", "updatedAt") VALUES
  ('inst_electrical', 'electrical', 'Electrical (DGUV V3)', 'Elektrisch (DGUV V3)', 0, 'BROKEN', true, true, 12, CURRENT_TIMESTAMP),
  ('inst_lifting', 'lifting', 'Lifting equipment', 'Anschlagmittel', 1, 'DECOMMISSIONED', true, false, 12, CURRENT_TIMESTAMP),
  ('inst_visual', 'visual', 'Visual check', 'Sichtprüfung', 2, 'MAINTENANCE', false, false, NULL, CURRENT_TIMESTAMP),
  ('inst_calibration', 'calibration', 'Calibration', 'Kalibrierung', 3, 'BROKEN', true, false, 12, CURRENT_TIMESTAMP);

-- Which units counted as electrical before: the product's own answer, else its category's.
CREATE TEMP TABLE "_electrical_product" AS
SELECT p."id", (NOT p."isLicense" AND COALESCE(p."requiresInspection", c."requiresInspection")) AS "required"
FROM "Product" p JOIN "Category" c ON c."id" = p."categoryId";

-- Units tracked as lifting equipment: Rigging, an interval, a product that is not electrical.
CREATE TEMP TABLE "_lifting_asset" AS
SELECT a."id", a."productId"
FROM "Asset" a
JOIN "Product" p ON p."id" = a."productId"
JOIN "Category" c ON c."id" = p."categoryId"
JOIN "_electrical_product" e ON e."id" = p."id"
WHERE a."inspectionIntervalMonths" IS NOT NULL AND c."name" = 'Rigging' AND NOT e."required";

INSERT INTO "CategoryInspectionType" ("categoryId", "typeId")
SELECT "id", 'inst_electrical' FROM "Category" WHERE "requiresInspection";

INSERT INTO "ProductInspectionType" ("productId", "typeId", "required")
SELECT "id", 'inst_electrical', "requiresInspection" FROM "Product" WHERE "requiresInspection" IS NOT NULL;

INSERT INTO "ProductInspectionType" ("productId", "typeId", "required")
SELECT DISTINCT "productId", 'inst_lifting', true FROM "_lifting_asset";

-- Every org keeps its interval, null included (it tracks nothing then).
INSERT INTO "OrgInspectionInterval" ("organizationId", "typeId", "months")
SELECT "id", 'inst_electrical', "defaultInspectionIntervalMonths" FROM "Organization";

INSERT INTO "AssetInspectionSchedule" ("assetId", "typeId", "intervalMonths", "nextDue")
SELECT a."id",
       CASE WHEN l."id" IS NULL THEN 'inst_electrical' ELSE 'inst_lifting' END,
       a."inspectionIntervalMonths",
       COALESCE(a."nextInspectionDue", a."createdAt")
FROM "Asset" a LEFT JOIN "_lifting_asset" l ON l."id" = a."id"
WHERE a."inspectionIntervalMonths" IS NOT NULL;

-- A unit keeps its interval as its own where its org would not give it that
-- interval now: its product does not need the type (someone tracked the unit
-- by hand), or the number differs from the org's. Every other unit follows the
-- org's interval from here on. The org's is its row for the type, else the
-- type's default (lifting has no org rows yet).
UPDATE "AssetInspectionSchedule" s
SET "overrideMonths" = s."intervalMonths"
FROM "Asset" a, "InspectionType" t, "_electrical_product" e
WHERE a."id" = s."assetId" AND t."id" = s."typeId" AND e."id" = a."productId"
  AND ((s."typeId" = 'inst_electrical' AND NOT e."required")
  OR s."intervalMonths" IS DISTINCT FROM COALESCE(
    (SELECT o."months" FROM "OrgInspectionInterval" o
      WHERE o."organizationId" = a."organizationId" AND o."typeId" = s."typeId"),
    CASE WHEN EXISTS (SELECT 1 FROM "OrgInspectionInterval" o
      WHERE o."organizationId" = a."organizationId" AND o."typeId" = s."typeId")
      THEN NULL ELSE t."defaultIntervalMonths" END
  ));

-- Units whose product needs electrical inspections but that never got an
-- interval, in an org that has one: tracked from now on, at the org's
-- interval, like a unit registered today would be. Never inspected means due
-- at once; otherwise the latest inspection decides, as in inspectionDue.
INSERT INTO "AssetInspectionSchedule" ("assetId", "typeId", "intervalMonths", "nextDue")
SELECT a."id", 'inst_electrical', o."months",
       CASE
         WHEN li."performedAt" IS NULL THEN a."createdAt"
         WHEN li."result" = 'FAILED' THEN li."performedAt"
         ELSE li."performedAt" + make_interval(months => o."months")
       END
FROM "Asset" a
JOIN "_electrical_product" e ON e."id" = a."productId" AND e."required"
JOIN "OrgInspectionInterval" o
  ON o."organizationId" = a."organizationId" AND o."typeId" = 'inst_electrical' AND o."months" IS NOT NULL
LEFT JOIN LATERAL (
  SELECT i."performedAt", i."result" FROM "Inspection" i
  WHERE i."assetId" = a."id"
  ORDER BY i."performedAt" DESC, i."createdAt" DESC LIMIT 1
) li ON true
WHERE a."status" NOT IN ('SOLD', 'DECOMMISSIONED')
  AND NOT EXISTS (
    SELECT 1 FROM "AssetInspectionSchedule" s
    WHERE s."assetId" = a."id" AND s."typeId" = 'inst_electrical'
  );

UPDATE "Asset" a
SET "nextInspectionDue" = (SELECT min(s."nextDue") FROM "AssetInspectionSchedule" s WHERE s."assetId" = a."id")
WHERE EXISTS (SELECT 1 FROM "AssetInspectionSchedule" s WHERE s."assetId" = a."id");



-- AlterTable
ALTER TABLE "Inspection" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'web',
ADD COLUMN     "typeId" TEXT;

UPDATE "Inspection" i
SET "typeId" = CASE WHEN l."id" IS NULL THEN 'inst_electrical' ELSE 'inst_lifting' END
FROM "Asset" a LEFT JOIN "_lifting_asset" l ON l."id" = a."id"
WHERE a."id" = i."assetId";

ALTER TABLE "Inspection" ALTER COLUMN "typeId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "InspectionType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Asset" DROP COLUMN "inspectionIntervalMonths";

-- AlterTable
ALTER TABLE "Category" DROP COLUMN "requiresInspection";

-- AlterTable
ALTER TABLE "Organization" DROP COLUMN "defaultInspectionIntervalMonths";

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "requiresInspection";

-- Who inspected and with what qualification, and what members are qualified for.

-- AlterTable
ALTER TABLE "Inspection" ADD COLUMN     "external" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "performedById" TEXT,
ADD COLUMN     "qualification" TEXT;

-- CreateTable
CREATE TABLE "MemberQualification" (
    "membershipId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberQualification_pkey" PRIMARY KEY ("membershipId","typeId")
);

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberQualification" ADD CONSTRAINT "MemberQualification_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "OrgMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberQualification" ADD CONSTRAINT "MemberQualification_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "InspectionType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

