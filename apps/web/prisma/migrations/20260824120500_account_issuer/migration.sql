-- better-auth 1.7 keys accounts by (issuer, accountId) instead of
-- (providerId, accountId), and requires the column to be NOT NULL. Existing
-- rows predate it, so add the column nullable, backfill, then constrain.
--
-- The value mirrors createLocalAccountIssuer() in @better-auth/core:
-- "local:" + encodeURIComponent(providerId). Every account in this database is
-- providerId 'credential' (email/password is the only enabled method), which
-- URL-encodes to itself.

ALTER TABLE "account" ADD COLUMN "issuer" TEXT;

UPDATE "account" SET "issuer" = 'local:' || "providerId" WHERE "issuer" IS NULL;

ALTER TABLE "account" ALTER COLUMN "issuer" SET NOT NULL;

CREATE UNIQUE INDEX "account_issuer_accountId_key" ON "account"("issuer", "accountId");
