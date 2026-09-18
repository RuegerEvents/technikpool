-- ── Asset history entries written incomplete ──────────────────────────────────
-- The asset history picks its sentence by the entry's `type` and fills it from
-- the fields beside it. Two writers left pieces out; both are fixed, and this
-- repairs what they already wrote.

-- Booking a bundle, and syncing one, wrote ADDED_TO_PRODUCTION without a
-- `type`, so those entries rendered as the bare action name.
UPDATE "AssetTransaction"
SET "data" = jsonb_set("data"::jsonb, '{type}', '"ADDED_TO_PRODUCTION"')
WHERE "action" = 'ADDED_TO_PRODUCTION'
  AND "data" IS NOT NULL
  AND "data"->>'type' IS NULL;

-- A loan request from the equipment planner left out the requesting org, so
-- the entry read "Requested for X by" and stopped. The production says who
-- asked; one that has since been deleted can't, and is left as it is.
UPDATE "AssetTransaction" t
SET "data" = t."data"::jsonb
  || jsonb_build_object('requestingOrgId', o."id", 'requestingOrgName', o."name")
FROM "Production" p
JOIN "Organization" o ON o."id" = p."organizationId"
WHERE t."action" = 'REQUESTED'
  AND t."productionId" = p."id"
  AND t."data" IS NOT NULL
  AND t."data"->>'requestingOrgName' IS NULL;
