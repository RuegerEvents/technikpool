-- Names sort the way people read them: "2m" before "10m", "A-2" before "a-10".
-- Postgres compares text character by character, so every `orderBy: { name }`
-- put "Kabel 10m" ahead of "Kabel 2m". An ICU collation with numeric ordering
-- (`kn-true`) fixes it where the sorting happens, so every query, the web and
-- the scanner's API responses pick it up without sorting again in JS.
--
-- The collation is deterministic, so equality and the unique indexes below
-- behave exactly as before; only the order changes. Prisma's schema has no way
-- to express a column collation and ignores it when diffing, so it lives here.
CREATE COLLATION IF NOT EXISTS "natural" (provider = icu, locale = 'de-u-kn-true');

ALTER TABLE "user" ALTER COLUMN "name" TYPE TEXT COLLATE "natural";
ALTER TABLE "Organization" ALTER COLUMN "name" TYPE TEXT COLLATE "natural";
ALTER TABLE "Manufacturer" ALTER COLUMN "name" TYPE TEXT COLLATE "natural";
ALTER TABLE "Connector" ALTER COLUMN "name" TYPE TEXT COLLATE "natural";
ALTER TABLE "ProductPort" ALTER COLUMN "label" TYPE TEXT COLLATE "natural";
ALTER TABLE "Category" ALTER COLUMN "name" TYPE TEXT COLLATE "natural";
ALTER TABLE "Product" ALTER COLUMN "name" TYPE TEXT COLLATE "natural";
ALTER TABLE "Location" ALTER COLUMN "name" TYPE TEXT COLLATE "natural";
ALTER TABLE "Asset" ALTER COLUMN "assetTag" TYPE TEXT COLLATE "natural";
ALTER TABLE "BundleTemplate" ALTER COLUMN "name" TYPE TEXT COLLATE "natural";
ALTER TABLE "AssetBundle" ALTER COLUMN "tag" TYPE TEXT COLLATE "natural";
ALTER TABLE "Production" ALTER COLUMN "name" TYPE TEXT COLLATE "natural";
ALTER TABLE "ServiceCategory" ALTER COLUMN "name" TYPE TEXT COLLATE "natural";
ALTER TABLE "OrgService" ALTER COLUMN "name" TYPE TEXT COLLATE "natural";
ALTER TABLE "Stocktake" ALTER COLUMN "name" TYPE TEXT COLLATE "natural";
