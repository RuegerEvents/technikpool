-- Organization.slug: the org's name in public URLs, made once from its short
-- name (else its name) with the same rules as #lib/org-slug.ts (umlauts spelled out, anything else
-- that is not a-z or 0-9 becomes a dash). A name that comes out the same as an
-- older org's gets -2, -3 … in creation order.
ALTER TABLE "Organization" ADD COLUMN "slug" TEXT;

WITH base AS (
  SELECT
    id,
    "createdAt",
    trim(BOTH '-' FROM regexp_replace(
      replace(replace(replace(replace(lower(COALESCE(NULLIF(trim("shortName"), ''), name)), 'ä', 'ae'), 'ö', 'oe'), 'ü', 'ue'), 'ß', 'ss'),
      '[^a-z0-9]+', '-', 'g'
    )) AS full_slug
  FROM "Organization"
),
cut AS (
  -- At most 40 characters, cut after a whole word where there is one.
  SELECT
    id,
    "createdAt",
    COALESCE(NULLIF(trim(BOTH '-' FROM CASE
      WHEN length(full_slug) <= 40 THEN full_slug
      WHEN position('-' IN left(full_slug, 41)) > 0 THEN regexp_replace(left(full_slug, 41), '-[^-]*$', '')
      ELSE left(full_slug, 40)
    END), ''), 'org') AS slug
  FROM base
),
numbered AS (
  SELECT id, slug, row_number() OVER (PARTITION BY slug ORDER BY "createdAt", id) AS n
  FROM cut
)
UPDATE "Organization" o
SET slug = CASE WHEN numbered.n = 1 THEN numbered.slug ELSE numbered.slug || '-' || numbered.n END
FROM numbered
WHERE o.id = numbered.id;

ALTER TABLE "Organization" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- RentalTermsVersion.number: 1, 2, 3 … per org, in the order they were saved.
ALTER TABLE "RentalTermsVersion" ADD COLUMN "number" INTEGER;

UPDATE "RentalTermsVersion" v
SET number = ranked.n
FROM (
  SELECT id, row_number() OVER (PARTITION BY "organizationId" ORDER BY "createdAt", id) AS n
  FROM "RentalTermsVersion"
) ranked
WHERE v.id = ranked.id;

ALTER TABLE "RentalTermsVersion" ALTER COLUMN "number" SET NOT NULL;
CREATE UNIQUE INDEX "RentalTermsVersion_organizationId_number_key" ON "RentalTermsVersion"("organizationId", "number");
