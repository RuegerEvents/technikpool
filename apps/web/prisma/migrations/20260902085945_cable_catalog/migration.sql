-- Cables as structured products.
--
-- Cables are the most numerous and least individual thing in the pool, and they
-- were modelled like a moving head: one row per name, with the length spelled
-- three different ways inside it. Two changes here. Products gain four columns
-- describing the cable itself, and connectors — the things on the ends — become
-- rows of their own so they can carry a picture and be spelled one way.

-- ── The cable itself ────────────────────────────────────────────────────────
ALTER TABLE "Product"
  ADD COLUMN "cableType"  TEXT,
  ADD COLUMN "connectorA" TEXT,
  ADD COLUMN "connectorB" TEXT,
  ADD COLUMN "lengthCm"   INTEGER;

-- ── Which way a cable runs ──────────────────────────────────────────────────
-- A department-level fact, not a per-connector one: a cable's male end takes
-- power in and its female end feeds the load, while an XLR's *female* end is
-- the one that receives. That flip is power-versus-signal, so it is recorded
-- once per department and every connector inherits it.
ALTER TABLE "Category" ADD COLUMN "cableInputGender" TEXT;

-- Strom: a cable's male end goes into the supply and takes power in.
UPDATE "Category" SET "cableInputGender" = 'male'   WHERE "id" = 'catg_power';
-- Audio: a mixer's mic input carries 48 V phantom, so the input is female and
-- the output male. A cable's female end therefore sits on the source and is the
-- end that receives.
UPDATE "Category" SET "cableInputGender" = 'female' WHERE "id" = 'catg_audio';
-- Licht is DMX, and DMX is deliberately the other way round from audio: the
-- console's output is female and a fixture's input is male, so a DMX cable's
-- *male* end is the one that receives. Same XLR shell, opposite convention —
-- which is the whole reason this is recorded per department rather than per
-- family, since XLR3 and XLR5 would otherwise have to disagree with each other.
UPDATE "Category" SET "cableInputGender" = 'male'   WHERE "id" = 'catg_light';
-- Netzwerk, Controller and Video are left null on purpose: an RJ45 patch lead
-- and an HDMI cable are the same connector at both ends, so there is no end to
-- put first. Audio's speakON is the same case — female at both ends — and the
-- check simply stays quiet for it rather than guessing.

-- ── The connector catalogue ─────────────────────────────────────────────────
-- `Product.connectorA/B` stay free text on purpose: a connector nobody has
-- catalogued is accepted when equipment is registered, and gets a row here on
-- save. This table is what those names accumulate against, never a gate in
-- front of them.
CREATE TABLE "Connector" (
    "id"         TEXT NOT NULL,
    "name"       TEXT NOT NULL,
    "slug"       TEXT NOT NULL,
    "family"     TEXT,
    "form"       TEXT,
    "gender"     TEXT,
    "categoryId" TEXT,
    "imagePath"  TEXT,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Connector_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Connector_slug_key" ON "Connector"("slug");

ALTER TABLE "Connector" ADD CONSTRAINT "Connector_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The vocabulary that used to be a hardcoded list in src/lib/cable.ts. The
-- table is the single source from here on; the list is reproduced once, here,
-- to give day one something to pick from and somewhere to hang a picture.
--
-- Three properties, and they are genuinely independent:
--
--   family  what it mates with. Not a prefix of the name: C13 and C14 are one
--           family because they plug into each other, while USB-A and USB-C are
--           two despite sharing three characters.
--   form    Where it sits: a Stecker is on the end of a cable, an Einbaubuchse
--           is mounted into a device or a panel. Descriptive only.
--   gender  Stifte or Buchsen — what the contacts are.
--
-- Nearly everything here is a Stecker, because nearly everything here is a
-- cable end — a Schuko Kupplung and an XLR3 F hang off a cable just as much as
-- their male counterparts do. The only Einbaubuchsen are the two powerCON
-- chassis parts, which are catalogued because an adapter or a built-in inlet
-- does end in one.
INSERT INTO "Connector" ("id", "name", "slug", "family", "form", "gender", "categoryId", "updatedAt")
SELECT
  'conn_' || substr(md5(random()::text || clock_timestamp()::text), 1, 24),
  seed.name,
  lower(seed.name),
  seed.family,
  seed.form,
  seed.gender,
  seed."categoryId",
  CURRENT_TIMESTAMP
FROM (VALUES
  ('XLR3 M',        'XLR3',       'plug',   'male',   'catg_audio'),
  ('XLR3 F',        'XLR3',       'plug',   'female', 'catg_audio'),
  -- 5-pin XLR is DMX far more often than it is audio, and DMX is Light's.
  ('XLR5 M',        'XLR5',       'plug',   'male',   'catg_light'),
  ('XLR5 F',        'XLR5',       'plug',   'female', 'catg_light'),
  ('Schuko M',      'Schuko',     'plug',   'male',   'catg_power'),
  ('Schuko F',      'Schuko',     'plug',   'female', 'catg_power'),
  ('CEE16 M',       'CEE16',      'plug',   'male',   'catg_power'),
  ('CEE16 F',       'CEE16',      'plug',   'female', 'catg_power'),
  ('CEE32 M',       'CEE32',      'plug',   'male',   'catg_power'),
  ('CEE32 F',       'CEE32',      'plug',   'female', 'catg_power'),
  -- Four powerCON rows, one family. Both cable ends are Stecker with female
  -- contacts, keyed by colour — blue feeds in, grey feeds on — so a link cable
  -- is Stecker→Stecker and perfectly ordinary. The male pair are the chassis
  -- parts: Buchse, male contacts, and in the catalogue because an adapter or a
  -- built-in inlet does end in one.
  ('powerCON blau F', 'powerCON', 'plug',   'female', 'catg_power'),
  ('powerCON grau F', 'powerCON', 'plug',   'female', 'catg_power'),
  ('powerCON blau M', 'powerCON', 'socket', 'male',   'catg_power'),
  ('powerCON grau M', 'powerCON', 'socket', 'male',   'catg_power'),
  -- TRUE1 ships a male *and* a female cable connector, unlike classic powerCON
  -- where both chassis parts are male and both cable ends are therefore female.
  -- Named by gender like every other family rather than by in/out: "in" and
  -- "out" are read from the device on some gear and from the cable on other,
  -- and the direction is derived from gender anyway (see cableInputGender).
  ('TRUE1 M',       'TRUE1',      'plug',   'male',   'catg_power'),
  ('TRUE1 F',       'TRUE1',      'plug',   'female', 'catg_power'),
  -- The C13 shell goes over the C14's pins, so the C13 is the receiving part.
  ('C13',           'Kaltgeräte', 'plug',   'female', 'catg_power'),
  ('C14',           'Kaltgeräte', 'plug',   'male',   'catg_power'),
  -- speakON: the cable connector is female inside and is still what you push in.
  ('NL2',           'NL2',        'plug',   'female', 'catg_audio'),
  ('NL4',           'NL4',        'plug',   'female', 'catg_audio'),
  ('Klinke 6.3',    'Klinke 6.3', 'plug',   'male',   'catg_audio'),
  ('Klinke 3.5',    'Klinke 3.5', 'plug',   'male',   'catg_audio'),
  ('Cinch',         'Cinch',      'plug',   'male',   'catg_audio'),
  ('RJ45',          'RJ45',       'plug',   'male',   'catg_network'),
  ('etherCON',      'etherCON',   'plug',   'male',   'catg_network'),
  ('BNC',           'BNC',        'plug',   'male',   'catg_video'),
  ('HDMI',          'HDMI',       'plug',   'male',   'catg_video'),
  -- Three USB families, not one: A, B and C mate with their own kind only, so
  -- a USB-A → USB-B lead is a converter and reads as one.
  ('USB-A',         'USB-A',      'plug',   'male',   'catg_controller'),
  ('USB-B',         'USB-B',      'plug',   'male',   'catg_controller'),
  ('USB-C',         'USB-C',      'plug',   'male',   'catg_controller')
) AS seed(name, family, form, gender, "categoryId")
-- A fresh install seeds categories elsewhere; skip a department that isn't there
-- rather than failing the migration over a prefill.
WHERE EXISTS (SELECT 1 FROM "Category" k WHERE k.id = seed."categoryId");

-- Whatever the catalogue already spells, so no existing product points at a
-- connector with no row. Its family is guessed the way src/lib/cable.ts guesses
-- it — the trailing gender word dropped — because a visible guess is worth more
-- than a null: it shows up in the connector form, which is where it gets fixed.
INSERT INTO "Connector" ("id", "name", "slug", "family", "updatedAt")
SELECT
  'conn_' || substr(md5(random()::text || clock_timestamp()::text), 1, 24),
  used.name,
  lower(used.name),
  CASE
    WHEN used.name ~* '\s(m|f|male|female|stecker|kupplung|in|out|blau|blue|grau|grey|gray)$'
      THEN btrim(regexp_replace(used.name, '\s+\S+$', ''))
    ELSE used.name
  END,
  CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT btrim("connectorA") AS name FROM "Product" WHERE btrim(coalesce("connectorA", '')) <> ''
  UNION
  SELECT DISTINCT btrim("connectorB") FROM "Product" WHERE btrim(coalesce("connectorB", '')) <> ''
) AS used
WHERE NOT EXISTS (SELECT 1 FROM "Connector" c WHERE c.slug = lower(used.name));
