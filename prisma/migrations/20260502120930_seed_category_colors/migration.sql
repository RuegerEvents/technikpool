-- Populate stored category colors (fixed lookup table)

UPDATE "Category" SET "color" = '#f97316' WHERE "name" = 'Audio';
UPDATE "Category" SET "color" = '#ef4444' WHERE "name" = 'Case';
UPDATE "Category" SET "color" = '#eab308' WHERE "name" = 'Light';
UPDATE "Category" SET "color" = '#22c55e' WHERE "name" = 'Controller';
UPDATE "Category" SET "color" = '#3b82f6' WHERE "name" = 'Network';
UPDATE "Category" SET "color" = '#6b7280' WHERE "name" = 'Power';
UPDATE "Category" SET "color" = '#ffffff' WHERE "name" = 'Miscellaneous';
UPDATE "Category" SET "color" = '#a855f7' WHERE "name" = 'Video';

-- Not specified in the request; keep neutral gray.
UPDATE "Category" SET "color" = '#a3a3a3' WHERE "name" = 'Rigging';
