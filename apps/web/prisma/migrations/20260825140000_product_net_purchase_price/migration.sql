-- The price a rental rate is calculated from moves from the individual unit to
-- the product. Billing asks what a kind of device costs per day, and two
-- identical units rent for the same money whenever they were bought.
ALTER TABLE "Product" ADD COLUMN "netPurchasePrice" DECIMAL(10,2);

-- Units of one product usually carry the same price; where they don't, the
-- price the most units agree on wins, and a tie goes to the higher one — a
-- product that bills too low is the failure nobody notices.
WITH ranked AS (
  SELECT "productId",
         "netPurchasePrice" AS price,
         ROW_NUMBER() OVER (
           PARTITION BY "productId"
           ORDER BY COUNT(*) DESC, "netPurchasePrice" DESC
         ) AS rn
  FROM "Asset"
  WHERE "netPurchasePrice" IS NOT NULL
  GROUP BY "productId", "netPurchasePrice"
)
UPDATE "Product" p
SET "netPurchasePrice" = r.price
FROM ranked r
WHERE r."productId" = p."id" AND r.rn = 1;

ALTER TABLE "Asset" DROP COLUMN "netPurchasePrice";
