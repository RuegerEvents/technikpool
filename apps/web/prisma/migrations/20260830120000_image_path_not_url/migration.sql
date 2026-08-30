-- Product images and manufacturer logos are stored as the object key alone
-- (`product-images/<uuid>.png`), not as a full URL. A stored URL pinned every
-- existing row to whatever host the object store was on the day it was
-- uploaded, so moving the store broke every image already in the catalogue.
ALTER TABLE "Product" RENAME COLUMN "imageUrl" TO "imagePath";
ALTER TABLE "Manufacturer" RENAME COLUMN "logoUrl" TO "logoPath";

-- Existing rows carry the old absolute URL. The key always begins at the
-- public prefix, so everything before it is the base that is now resolved at
-- render time; rows that already hold a bare key are left alone.
UPDATE "Product"
SET "imagePath" = substring("imagePath" FROM position('product-images/' IN "imagePath"))
WHERE "imagePath" LIKE '%/product-images/%';

UPDATE "Manufacturer"
SET "logoPath" = substring("logoPath" FROM position('product-images/' IN "logoPath"))
WHERE "logoPath" LIKE '%/product-images/%';
