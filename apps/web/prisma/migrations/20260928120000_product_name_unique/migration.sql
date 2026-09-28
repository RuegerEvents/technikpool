-- One product per name and manufacturer, ignoring case and surrounding blanks:
-- two catalogue entries called the same are two entries every picker offers and
-- nobody can tell apart. `assertProductNameFree`
-- (src/lib/server/services/product-name.ts) says so to the user; this is the
-- backstop. Products without a manufacturer are one namespace of their own,
-- hence the COALESCE — a plain unique index treats every NULL as distinct.
--
-- Prisma's schema cannot express an index on expressions, so it lives here only.

-- The server runs `migrate deploy` before it starts, so a duplicate already in
-- the table must not fail this migration. The oldest entry keeps its name; every
-- later one gets " (2)", " (3)" … and can be merged away on /products.
WITH ranked AS (
  SELECT "id",
         row_number() OVER (
           PARTITION BY COALESCE("manufacturerId", ''), lower(btrim("name"))
           ORDER BY "createdAt", "id"
         ) AS n
  FROM "Product"
)
UPDATE "Product" p
SET "name" = btrim(p."name") || ' (' || ranked.n || ')'
FROM ranked
WHERE ranked."id" = p."id" AND ranked.n > 1;

CREATE UNIQUE INDEX "Product_manufacturer_name_key"
  ON "Product" (COALESCE("manufacturerId", ''), lower(btrim("name")));
