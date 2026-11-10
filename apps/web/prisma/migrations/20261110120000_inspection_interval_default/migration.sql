-- A new org starts with a yearly DGUV interval. Existing orgs keep whatever
-- they have, null included: their interval is their own decision, and the
-- inspections page now says when an org has none.
ALTER TABLE "Organization" ALTER COLUMN "defaultInspectionIntervalMonths" SET DEFAULT 12;
