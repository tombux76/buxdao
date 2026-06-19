-- Claim rewards ledger (admin /addclaim + Discord engagement); extends holder_reward_accounts

CREATE TABLE IF NOT EXISTS holder_reward_ledger (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source VARCHAR(32) NOT NULL CHECK (source IN ('admin', 'discord_message', 'discord_reaction')),
  amount_raw BIGINT NOT NULL CHECK (amount_raw > 0),
  reward_date_et DATE NOT NULL,
  dedup_key TEXT UNIQUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_holder_reward_ledger_user_date
  ON holder_reward_ledger (user_id, reward_date_et DESC);

CREATE INDEX IF NOT EXISTS idx_holder_reward_ledger_source
  ON holder_reward_ledger (source, created_at DESC);

CREATE TABLE IF NOT EXISTS discord_engagement_daily (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reward_date_et DATE NOT NULL,
  messages_count INTEGER NOT NULL DEFAULT 0,
  reactions_count INTEGER NOT NULL DEFAULT 0,
  messages_bux_raw BIGINT NOT NULL DEFAULT 0,
  reactions_bux_raw BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, reward_date_et)
);

CREATE TABLE IF NOT EXISTS discord_engagement_sync_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
