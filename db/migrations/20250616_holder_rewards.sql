-- BUXDAO holder daily rewards (parallel to GraveStake; feature-flagged)

CREATE TABLE IF NOT EXISTS holder_reward_accounts (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  unclaimed_balance_raw BIGINT NOT NULL DEFAULT 0 CHECK (unclaimed_balance_raw >= 0),
  total_claimed_raw BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS holder_reward_accruals (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reward_date_et DATE NOT NULL,
  amount_raw BIGINT NOT NULL,
  nft_count INTEGER NOT NULL DEFAULT 0,
  breakdown JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, reward_date_et)
);

CREATE INDEX IF NOT EXISTS idx_holder_reward_accruals_date ON holder_reward_accruals (reward_date_et DESC);

CREATE TABLE IF NOT EXISTS holder_nft_hold_tracking (
  mint TEXT PRIMARY KEY,
  holder_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  last_owner TEXT,
  hold_started_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_holder_nft_hold_user ON holder_nft_hold_tracking (holder_user_id);

CREATE TABLE IF NOT EXISTS holder_reward_claims (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payout_wallet TEXT NOT NULL,
  amount_raw BIGINT NOT NULL,
  fee_lamports BIGINT NOT NULL,
  tx_signature TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_holder_reward_claims_user ON holder_reward_claims (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS holder_reward_pending_claims (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  payout_wallet TEXT NOT NULL,
  amount_raw BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS holder_reward_used_tx_signatures (
  tx_signature TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
