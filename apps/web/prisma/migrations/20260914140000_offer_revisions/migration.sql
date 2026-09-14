-- ── Offer revisions ──────────────────────────────────────────────────────────
-- A finalized offer that has to change is re-issued as "<number>-V2", "-V3"…
-- Each revision points at the first version; existing offers are all V1.

ALTER TABLE "Offer" ADD COLUMN "originalOfferId" TEXT;
ALTER TABLE "Offer" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX "Offer_originalOfferId_revision_key"
ON "Offer"("originalOfferId", "revision");

ALTER TABLE "Offer"
ADD CONSTRAINT "Offer_originalOfferId_fkey"
FOREIGN KEY ("originalOfferId") REFERENCES "Offer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
