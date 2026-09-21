-- A cable's ends were names matched against the connector catalogue by
-- lowercased spelling. They become foreign keys, so a rename reaches every
-- cable and a delete sees every use, and the names go: a copy of the
-- connector's name beside its id is a second answer that can disagree.

ALTER TABLE "Product" ADD COLUMN "connectorAId" TEXT,
ADD COLUMN "connectorBId" TEXT;

ALTER TABLE "CableWay" ADD COLUMN "connectorAId" TEXT,
ADD COLUMN "connectorBId" TEXT;

-- Blank ends become real nulls, so nothing below has to tell '' from absent.
UPDATE "Product" SET "connectorA" = NULLIF(btrim("connectorA"), ''), "connectorB" = NULLIF(btrim("connectorB"), '');
UPDATE "CableWay" SET "connectorA" = NULLIF(btrim("connectorA"), ''), "connectorB" = NULLIF(btrim("connectorB"), '');

-- Every name in use gets a row first. Loom ways never had a backfill (the app
-- created their rows on save), and a connector renamed or deleted since would
-- have left a name behind. One row per spelling-insensitive name: "Schuko M"
-- and "schuko m" are one connector, and the first spelling wins. The family is
-- guessed the way 20260902085945_cable_catalog guessed it.
INSERT INTO "Connector" ("id", "name", "slug", "family", "updatedAt")
SELECT
  'conn_' || substr(md5(random()::text || clock_timestamp()::text), 1, 24),
  used.name,
  lower(used.name),
  CASE
    WHEN used.name ~* '\s(m|f|male|female|stecker|kupplung|in|out|blau|blue|grau|grey|gray)$'
      THEN btrim(regexp_replace(used.name, '\s+\S+$', ''))
    ELSE used.name
  END,
  CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT ON (lower(name)) name
  FROM (
    SELECT "connectorA" AS name FROM "Product" WHERE "connectorA" IS NOT NULL
    UNION ALL SELECT "connectorB" FROM "Product" WHERE "connectorB" IS NOT NULL
    UNION ALL SELECT "connectorA" FROM "CableWay" WHERE "connectorA" IS NOT NULL
    UNION ALL SELECT "connectorB" FROM "CableWay" WHERE "connectorB" IS NOT NULL
  ) AS names
  ORDER BY lower(name), name
) AS used
WHERE NOT EXISTS (SELECT 1 FROM "Connector" c WHERE c.slug = lower(used.name));

-- Point every end at its row.
UPDATE "Product" p SET "connectorAId" = c.id
FROM "Connector" c WHERE c.slug = lower(p."connectorA");
UPDATE "Product" p SET "connectorBId" = c.id
FROM "Connector" c WHERE c.slug = lower(p."connectorB");
UPDATE "CableWay" w SET "connectorAId" = c.id
FROM "Connector" c WHERE c.slug = lower(w."connectorA");
UPDATE "CableWay" w SET "connectorBId" = c.id
FROM "Connector" c WHERE c.slug = lower(w."connectorB");

ALTER TABLE "Product" DROP COLUMN "connectorA", DROP COLUMN "connectorB";
ALTER TABLE "CableWay" DROP COLUMN "connectorA", DROP COLUMN "connectorB";

CREATE INDEX "Product_connectorAId_idx" ON "Product"("connectorAId");
CREATE INDEX "Product_connectorBId_idx" ON "Product"("connectorBId");
CREATE INDEX "CableWay_connectorAId_idx" ON "CableWay"("connectorAId");
CREATE INDEX "CableWay_connectorBId_idx" ON "CableWay"("connectorBId");

ALTER TABLE "Product" ADD CONSTRAINT "Product_connectorAId_fkey" FOREIGN KEY ("connectorAId") REFERENCES "Connector"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_connectorBId_fkey" FOREIGN KEY ("connectorBId") REFERENCES "Connector"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CableWay" ADD CONSTRAINT "CableWay_connectorAId_fkey" FOREIGN KEY ("connectorAId") REFERENCES "Connector"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CableWay" ADD CONSTRAINT "CableWay_connectorBId_fkey" FOREIGN KEY ("connectorBId") REFERENCES "Connector"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Unrelated drift, caught by the diff for this migration: making
-- Product.manufacturerId optional (20260921120000_manufacturer_optional) changed
-- the relation's default onDelete to SET NULL without rewriting the constraint.
ALTER TABLE "Product" DROP CONSTRAINT "Product_manufacturerId_fkey";
ALTER TABLE "Product" ADD CONSTRAINT "Product_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "Manufacturer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
