-- ZAC-251: per-category flag to omit a shelf from the header mega-menu.
-- Products stay categorized; /categories and deals browse still list the node.
-- Helmet parts is hidden from nav by default (cheap accessories clutter Gear).

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS hide_from_nav BOOLEAN NOT NULL DEFAULT false;

UPDATE categories
SET hide_from_nav = true
WHERE slug = 'gear-helmet-parts';
