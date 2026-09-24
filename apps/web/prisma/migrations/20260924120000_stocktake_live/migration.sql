-- An open stocktake no longer keeps a list of its own: what it expects is
-- resolved from its scope whenever it is read, and only ticks are stored.
-- The rows an earlier version wrote at the start would otherwise be read as
-- ticks, so they go; closed stocktakes keep their frozen report untouched.
DELETE FROM "StocktakeItem" i
USING "Stocktake" s
WHERE i."stocktakeId" = s.id AND s.status = 'OPEN' AND i."foundAt" IS NULL;

DELETE FROM "StocktakeLine" l
USING "Stocktake" s
WHERE l."stocktakeId" = s.id AND s.status = 'OPEN';
