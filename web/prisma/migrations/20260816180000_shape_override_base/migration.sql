-- Capture the feed's own geometry on the first operator edit, so a drawn shape
-- can be reset without a full reseed. Nullable and additive: existing rows keep
-- NULL and simply cannot be reset (the action says so rather than guessing).
ALTER TABLE "shape_override" ADD COLUMN "baseGeojson" JSONB;
