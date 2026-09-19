-- Every user gets a home org, the one lists open on: the org they have the most
-- say in, the oldest membership on a tie — the same rule +layout.server.ts falls
-- back on. A home org they no longer belong to is replaced the same way; one
-- they chose and still belong to is kept.
UPDATE "user" u
SET "homeOrgId" = pick."organizationId"
FROM (
  SELECT DISTINCT ON ("userId") "userId", "organizationId"
  FROM "OrgMembership"
  ORDER BY
    "userId",
    CASE "role"
      WHEN 'OWNER' THEN 4
      WHEN 'ADMIN' THEN 3
      WHEN 'MEMBER' THEN 2
      WHEN 'VIEWER' THEN 1
      ELSE 0
    END DESC,
    "createdAt" ASC
) pick
WHERE u."id" = pick."userId"
  AND (
    u."homeOrgId" IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM "OrgMembership" m
      WHERE m."userId" = u."id" AND m."organizationId" = u."homeOrgId"
    )
  );
