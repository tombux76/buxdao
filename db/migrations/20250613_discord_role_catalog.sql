-- Display metadata for Discord role IDs assigned by in-server verification (GraveKeeper).
-- User role membership is fetched live from Discord — not stored per user.

BEGIN;

CREATE TABLE IF NOT EXISTS discord_role_catalog (
  discord_role_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#ffffff',
  emoji_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_discord_role_catalog_sort ON discord_role_catalog (sort_order, display_name);

COMMIT;
