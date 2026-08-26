-- Categories carry a German display name alongside the English source name.
ALTER TABLE "Category" ADD COLUMN "nameDe" TEXT;

-- The German name a billing document prints, snapshotted like categoryName so
-- an issued document keeps the wording it was issued with (GoBD).
ALTER TABLE "OfferItem" ADD COLUMN "categoryNameDe" TEXT;
ALTER TABLE "InvoiceItem" ADD COLUMN "categoryNameDe" TEXT;

UPDATE "Category" SET "nameDe" = 'Audio' WHERE "id" = 'catg_audio';
UPDATE "Category" SET "nameDe" = 'Case' WHERE "id" = 'catg_case';
UPDATE "Category" SET "nameDe" = 'Controller' WHERE "id" = 'catg_controller';
UPDATE "Category" SET "nameDe" = 'Licht' WHERE "id" = 'catg_light';
UPDATE "Category" SET "nameDe" = 'Netzwerk' WHERE "id" = 'catg_network';
UPDATE "Category" SET "nameDe" = 'Strom' WHERE "id" = 'catg_power';
UPDATE "Category" SET "nameDe" = 'Video' WHERE "id" = 'catg_video';
UPDATE "Category" SET "nameDe" = 'Sonstiges' WHERE "id" = 'catg_misc';
UPDATE "Category" SET "nameDe" = 'Rigging' WHERE "id" = 'catg_rigging';

-- Existing billing lines get the German name of the category they point at.
UPDATE "OfferItem" oi SET "categoryNameDe" = c."nameDe" FROM "Category" c WHERE oi."categoryId" = c."id";
UPDATE "InvoiceItem" ii SET "categoryNameDe" = c."nameDe" FROM "Category" c WHERE ii."categoryId" = c."id";
