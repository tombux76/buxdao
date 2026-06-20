-- Track last GraveStake activity sync per collection pool
CREATE TABLE IF NOT EXISTS gravestake_activity_sync_state (
  collection_slug TEXT PRIMARY KEY,
  last_block_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
