-- Connectors that carry mains voltage. A device or cable with one needs DGUV
-- V3 inspections; the app hints at it where a product isn't marked so.
ALTER TABLE "Connector" ADD COLUMN "mains" BOOLEAN NOT NULL DEFAULT false;

-- The mains systems in use on German stages, by family or, where a row has
-- none, by the start of its name. Editable per connector afterwards.
UPDATE "Connector"
SET "mains" = true
WHERE lower(coalesce("family", '')) IN (
    'schuko', 'kaltgeräte', 'kaltgeraete', 'iec', 'c13/c14', 'c19/c20', 'c7/c8', 'c5/c6',
    'powercon', 'powercon true1', 'true1', 'cee', 'cee16', 'cee32', 'cee63', 'cee125',
    'socapex', 'harting', 'lk37', 'perilex'
  )
  OR lower("name") ~ '^(schuko|kaltger|c13|c14|c19|c20|c7|c8|c5|c6|powercon|true1|cee ?[0-9]|socapex|harting|lk37|perilex)';
