-- The next DGUV inspection is no longer set: it follows from the unit's
-- interval and its latest inspection (see src/lib/inspection-due.ts), so every
-- stored date is derived again under that rule.
--   no interval        -> nothing due
--   never inspected    -> due since the unit was registered
--   latest one failed  -> due since that inspection
--   otherwise          -> latest inspection + interval
UPDATE "Asset" AS a
SET "nextInspectionDue" = CASE
    WHEN a."inspectionIntervalMonths" IS NULL THEN NULL
    WHEN li."performedAt" IS NULL THEN a."createdAt"
    WHEN li."result" = 'FAILED' THEN li."performedAt"
    ELSE li."performedAt" + make_interval(months => a."inspectionIntervalMonths")
  END
FROM "Asset" AS base
LEFT JOIN LATERAL (
  SELECT i."performedAt", i."result"
  FROM "Inspection" AS i
  WHERE i."assetId" = base."id"
  ORDER BY i."performedAt" DESC, i."createdAt" DESC
  LIMIT 1
) AS li ON TRUE
WHERE base."id" = a."id";
