-- VIEWER used to see productions, customers and prices. It was split in two for
-- data privacy, and everyone who held it lands on the narrower half: widening
-- someone's access again is a click, taking back what they already saw is not.
UPDATE "OrgMembership" SET "role" = 'DEVICE_VIEWER' WHERE "role" = 'VIEWER';

-- A pending invitation carries the role it will grant, so it is moved too.
UPDATE "Invitation" SET "role" = 'DEVICE_VIEWER' WHERE "role" = 'VIEWER';

-- AlterTable
ALTER TABLE "OrgMembership" ALTER COLUMN "role" SET DEFAULT 'DEVICE_VIEWER';
