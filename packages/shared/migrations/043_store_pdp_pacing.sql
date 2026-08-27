-- Per-store PDP drainer pacing and persistent circuit-breaker cooldown (ZAC-225).

ALTER TABLE stores ADD COLUMN IF NOT EXISTS pdp_consecutive_failures INT NOT NULL DEFAULT 0;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS pdp_cooldown_until TIMESTAMPTZ;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS pdp_last_fetch_at TIMESTAMPTZ;
