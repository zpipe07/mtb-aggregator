-- Curated MTB giveaways and raffles (ZAC-47). Manual admin CRUD; not scraped.

CREATE TABLE IF NOT EXISTS giveaways (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(120) NOT NULL,
  kind VARCHAR(20) NOT NULL CHECK (kind IN ('giveaway', 'raffle')),
  title VARCHAR(300) NOT NULL,
  summary TEXT NOT NULL,
  prize_name VARCHAR(300) NOT NULL,
  prize_description TEXT,
  image_url TEXT,
  host_name VARCHAR(120) NOT NULL,
  entry_url TEXT NOT NULL,
  official_rules_url TEXT NOT NULL,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ NOT NULL,
  eligibility TEXT,
  entry_requirements TEXT,
  ticket_price NUMERIC(10, 2),
  ticket_currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  beneficiary TEXT,
  published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (slug),
  UNIQUE (entry_url)
);

CREATE INDEX IF NOT EXISTS idx_giveaways_public_list
  ON giveaways (published, ends_at DESC)
  WHERE published = true;
