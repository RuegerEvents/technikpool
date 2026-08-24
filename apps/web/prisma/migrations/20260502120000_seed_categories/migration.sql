-- Seed fixed categories and backfill existing data

INSERT INTO "public"."Category" ("id", "name", "sortOrder", "createdAt", "updatedAt")
VALUES
  ('catg_audio', 'Audio', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('catg_case', 'Case', 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('catg_controller', 'Controller', 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('catg_light', 'Light', 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('catg_network', 'Network', 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('catg_power', 'Power', 6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('catg_video', 'Video', 7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('catg_misc', 'Miscellaneous', 8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('catg_rigging', 'Rigging', 9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

UPDATE "public"."Product"
SET "categoryId" = (
  SELECT "id" FROM "public"."Category" WHERE "name" = 'Miscellaneous' LIMIT 1
)
WHERE "categoryId" IS NULL;

UPDATE "public"."AssetBundle"
SET "categoryId" = (
  SELECT "id" FROM "public"."Category" WHERE "name" = 'Miscellaneous' LIMIT 1
)
WHERE "categoryId" IS NULL;
