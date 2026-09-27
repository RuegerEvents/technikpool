-- Every unit's number within its org, #1 onwards, never handed out twice.
ALTER TABLE "Organization" ADD COLUMN "nextAssetIndex" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Asset" ADD COLUMN "orgIndex" INTEGER NOT NULL DEFAULT 0;

-- The units there are, numbered in the order they were created.
UPDATE "Asset" a
SET "orgIndex" = numbered.n
FROM (
  SELECT id, row_number() OVER (PARTITION BY "organizationId" ORDER BY "createdAt", id) AS n
  FROM "Asset"
) numbered
WHERE a.id = numbered.id;

UPDATE "Organization" o
SET "nextAssetIndex" = COALESCE(
  (SELECT max("orgIndex") FROM "Asset" a WHERE a."organizationId" = o.id), 0
) + 1;

CREATE UNIQUE INDEX "Asset_organizationId_orgIndex_key" ON "Asset"("organizationId", "orgIndex");

-- Assigned here rather than in the app, so that every way a unit is created —
-- the forms, the cable batch, bundle and accessory copies, the CSV import, the
-- scanner's API, and whatever comes next — gets one. Drawing from the org's
-- counter takes that row's lock, so two inserts at once take turns, and the
-- counter only grows: a deleted unit's number stays gone.
CREATE FUNCTION assign_asset_org_index() RETURNS trigger AS $$
BEGIN
  UPDATE "Organization"
  SET "nextAssetIndex" = "nextAssetIndex" + 1
  WHERE id = NEW."organizationId"
  RETURNING "nextAssetIndex" - 1 INTO NEW."orgIndex";
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER asset_org_index
BEFORE INSERT ON "Asset"
FOR EACH ROW EXECUTE FUNCTION assign_asset_org_index();
