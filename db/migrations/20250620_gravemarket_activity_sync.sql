-- Track last GraveMarket activity sync per collection (cron overlap window)
CREATE TABLE IF NOT EXISTS gravemarket_activity_sync_state (
  collection_slug TEXT PRIMARY KEY,
  last_event_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
