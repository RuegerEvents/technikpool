-- Backfill temporary color + avatarLabel for existing orgs before the columns
-- become required (issue #13: always manually set afterward via org settings,
-- this is just a one-off unblock so the NOT NULL migration doesn't fail).

UPDATE "Organization" SET "color" = '#0069c9', "avatarLabel" = 'RE' WHERE "id" = 'cmo7minxg00009ohzrtinsu00';
UPDATE "Organization" SET "color" = '#f59e0b', "avatarLabel" = 'TO' WHERE "id" = 'org_qJWWPSfWi9gqKrRWqWRhNST6';
UPDATE "Organization" SET "color" = '#ef4444', "avatarLabel" = 'VO' WHERE "id" = 'org_Sg6RI5aWokegnpRQvJtvLvjT';
UPDATE "Organization" SET "color" = '#8b5cf6', "avatarLabel" = 'AO' WHERE "id" = 'cmohc94230000yf84i67l2qi7';
UPDATE "Organization" SET "color" = '#10b981', "avatarLabel" = 'VC' WHERE "id" = 'org_ytTeGf1zNCyO5gjAax8z84r2';
UPDATE "Organization" SET "color" = '#f97316', "avatarLabel" = 'EC' WHERE "id" = 'org_wuVKO4P7CTgkqLb9foASxLLX';
