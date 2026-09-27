-- Numbering new units' asset tags again, as a per-org choice (off by default).
ALTER TABLE "Organization" ADD COLUMN "autoAssetTags" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "nextAssetTagNumber" INTEGER NOT NULL DEFAULT 1;

-- Start each org's counter after the highest tag already in its pattern —
-- prefix plus exactly five digits — so the first number handed out is free.
-- Tags outside the pattern (two scans run together, a hand-typed oddity) are
-- no number at all and are left out.
UPDATE "Organization" o
SET "nextAssetTagNumber" = sub.n + 1
FROM (
  SELECT o2.id, max(substring(a."assetTag" FROM length(o2."assetIdPrefix") + 1)::int) AS n
  FROM "Organization" o2
  JOIN "Asset" a
    ON left(a."assetTag", length(o2."assetIdPrefix")) = o2."assetIdPrefix"
   AND substring(a."assetTag" FROM length(o2."assetIdPrefix") + 1) ~ '^[0-9]{5}$'
  GROUP BY o2.id
) sub
WHERE o.id = sub.id;
