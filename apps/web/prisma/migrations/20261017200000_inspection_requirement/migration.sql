-- Whether a unit needs DGUV inspections: the category's default, overridden by
-- the product where it says so. Until now the org's default interval was
-- stamped onto every new unit, cases and rigging included.
ALTER TABLE "Category" ADD COLUMN "requiresInspection" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN "requiresInspection" BOOLEAN;

-- Cases and rigging are not electrical equipment: their units stop being
-- tracked. Everything else keeps its interval until someone decides.
UPDATE "Asset" AS a
SET "inspectionIntervalMonths" = NULL, "nextInspectionDue" = NULL
FROM "Product" AS p
JOIN "Category" AS c ON c."id" = p."categoryId"
WHERE a."productId" = p."id"
  AND lower(c."name") IN ('case', 'cases', 'rigging')
  AND a."inspectionIntervalMonths" IS NOT NULL;
