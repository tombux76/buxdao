-- BUXDAO v2 — unified Postgres schema
-- Auth.js (Discord + X) · wallet links · merch · casino · cashout

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Auth.js adapter tables (https://authjs.dev/getting-started/adapters/pg)
-- ---------------------------------------------------------------------------

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE,
  "emailVerified" TIMESTAMPTZ,
  discord_id VARCHAR(255),
  discord_username VARCHAR(255),
  discord_image TEXT,
  x_username VARCHAR(255),
  x_user_id VARCHAR(255),
  x_image TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_users_discord_id ON users (discord_id) WHERE discord_id IS NOT NULL;

CREATE TABLE accounts (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(255) NOT NULL,
  provider VARCHAR(255) NOT NULL,
  "providerAccountId" VARCHAR(255) NOT NULL,
  refresh_token TEXT,
  access_token TEXT,
  expires_at BIGINT,
  token_type VARCHAR(255),
  scope VARCHAR(255),
  id_token TEXT,
  session_state VARCHAR(255),
  UNIQUE (provider, "providerAccountId")
);

CREATE INDEX idx_accounts_user_id ON accounts ("userId");

CREATE TABLE sessions (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires TIMESTAMPTZ NOT NULL,
  "sessionToken" VARCHAR(255) NOT NULL UNIQUE
);

CREATE INDEX idx_sessions_user_id ON sessions ("userId");

CREATE TABLE verification_token (
  identifier TEXT NOT NULL,
  token TEXT NOT NULL,
  expires TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (identifier, token)
);

-- ---------------------------------------------------------------------------
-- Wallet linking (signed-message flow)
-- ---------------------------------------------------------------------------

CREATE TABLE user_wallets (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, wallet_address),
  UNIQUE (wallet_address)
);

CREATE INDEX idx_user_wallets_user_id ON user_wallets (user_id);

CREATE TABLE wallet_link_challenges (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nonce TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);

CREATE INDEX idx_wallet_link_challenges_user_id ON wallet_link_challenges (user_id);

-- ---------------------------------------------------------------------------
-- Discord role display catalog (membership fetched live from Discord API)
-- ---------------------------------------------------------------------------

CREATE TABLE discord_role_catalog (
  discord_role_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#ffffff',
  emoji_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_discord_role_catalog_sort ON discord_role_catalog (sort_order, display_name);

-- ---------------------------------------------------------------------------
-- Merch (Printful + SOL checkout)
-- ---------------------------------------------------------------------------

CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  wallet_address VARCHAR(64) NOT NULL,
  tx_signature VARCHAR(128),
  cart JSONB NOT NULL,
  shipping_info JSONB NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'processing',
  printful_order_id INTEGER,
  total_usd NUMERIC(12, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_orders_wallet_address ON orders (wallet_address);
CREATE INDEX idx_orders_user_id ON orders (user_id);

-- ---------------------------------------------------------------------------
-- Holder Hub — $BUX → SOL cashout (new site; not legacy staking claims)
-- ---------------------------------------------------------------------------

CREATE TABLE cashout_transactions (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  bux_amount BIGINT NOT NULL,
  sol_amount BIGINT,
  fee_lamports BIGINT,
  bux_tx_signature TEXT,
  tx_signature TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_cashout_transactions_user_id ON cashout_transactions (user_id);
CREATE INDEX idx_cashout_transactions_status ON cashout_transactions (status, created_at DESC);

CREATE UNIQUE INDEX idx_cashout_transactions_bux_tx
  ON cashout_transactions (bux_tx_signature)
  WHERE bux_tx_signature IS NOT NULL;

CREATE TABLE cashout_pending_claims (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  payout_wallet TEXT NOT NULL,
  bux_amount_raw BIGINT NOT NULL,
  sol_gross_lamports BIGINT NOT NULL,
  fee_lamports BIGINT NOT NULL,
  sol_net_lamports BIGINT NOT NULL,
  token_value_snapshot DOUBLE PRECISION NOT NULL,
  fee_bps INTEGER NOT NULL,
  bux_tx_signature TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE cashout_used_signatures (
  tx_signature TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Casino games (wallet-keyed; join user_wallets for Discord display names)
-- ---------------------------------------------------------------------------

CREATE TABLE slots_players (
  wallet_address TEXT NOT NULL,
  token_used TEXT NOT NULL DEFAULT 'bux',
  total_spins INTEGER DEFAULT 0,
  total_won BIGINT DEFAULT 0,
  total_wagered BIGINT DEFAULT 0,
  unclaimed_rewards BIGINT DEFAULT 0,
  spins_remaining INTEGER DEFAULT 0,
  cost_per_spin INTEGER DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (wallet_address, token_used)
);

CREATE TABLE slots_game_history (
  id BIGSERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  spin_cost BIGINT NOT NULL,
  result_symbols TEXT[] NOT NULL,
  won_amount BIGINT DEFAULT 0,
  token_used TEXT DEFAULT 'bux',
  timestamp TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_slots_game_history_wallet ON slots_game_history (wallet_address, timestamp DESC);

CREATE TABLE slots_purchases (
  id BIGSERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  token_used TEXT NOT NULL,
  cost_per_spin INTEGER NOT NULL,
  num_spins INTEGER NOT NULL,
  total_cost_raw BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE coinflip_players (
  wallet_address TEXT NOT NULL,
  token_used TEXT NOT NULL DEFAULT 'bux',
  total_flips INTEGER DEFAULT 0,
  total_won BIGINT DEFAULT 0,
  total_wagered BIGINT DEFAULT 0,
  unclaimed_rewards BIGINT DEFAULT 0,
  flips_remaining INTEGER DEFAULT 0,
  cost_per_flip INTEGER DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (wallet_address, token_used)
);

CREATE TABLE coinflip_game_history (
  id BIGSERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  flip_cost BIGINT NOT NULL,
  choice TEXT NOT NULL,
  result TEXT NOT NULL,
  won_amount BIGINT DEFAULT 0,
  token_used TEXT DEFAULT 'bux',
  timestamp TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_coinflip_game_history_wallet ON coinflip_game_history (wallet_address, timestamp DESC);

CREATE TABLE coinflip_purchases (
  id BIGSERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  token_used TEXT NOT NULL,
  cost_per_flip INTEGER NOT NULL,
  num_flips INTEGER NOT NULL,
  total_cost_raw BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE roulette_players (
  wallet_address TEXT NOT NULL,
  token_used TEXT NOT NULL DEFAULT 'bux',
  total_spins INTEGER DEFAULT 0,
  total_won BIGINT DEFAULT 0,
  total_wagered BIGINT DEFAULT 0,
  unclaimed_rewards BIGINT DEFAULT 0,
  chips_balance INTEGER DEFAULT 0,
  cost_per_chip INTEGER DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (wallet_address, token_used)
);

CREATE TABLE roulette_game_history (
  id BIGSERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  spin_cost BIGINT NOT NULL,
  result_number TEXT NOT NULL,
  won_amount BIGINT DEFAULT 0,
  token_used TEXT DEFAULT 'bux',
  timestamp TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_roulette_game_history_wallet ON roulette_game_history (wallet_address, timestamp DESC);

CREATE TABLE roulette_purchases (
  id BIGSERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  token_used TEXT NOT NULL,
  cost_per_chip INTEGER NOT NULL,
  num_chips INTEGER NOT NULL,
  total_cost_raw BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE casino_daily_totals (
  date_et TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  token_used TEXT NOT NULL DEFAULT 'bux',
  game_type TEXT NOT NULL,
  plays INTEGER NOT NULL DEFAULT 0,
  spent_raw BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (date_et, wallet_address, token_used, game_type)
);

-- ---------------------------------------------------------------------------
-- Holder daily rewards (parallel to GraveStake; feature-flagged)
-- ---------------------------------------------------------------------------

CREATE TABLE holder_reward_accounts (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  unclaimed_balance_raw BIGINT NOT NULL DEFAULT 0 CHECK (unclaimed_balance_raw >= 0),
  total_claimed_raw BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE holder_reward_accruals (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reward_date_et DATE NOT NULL,
  amount_raw BIGINT NOT NULL,
  nft_count INTEGER NOT NULL DEFAULT 0,
  breakdown JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, reward_date_et)
);

CREATE INDEX idx_holder_reward_accruals_date ON holder_reward_accruals (reward_date_et DESC);

CREATE TABLE holder_nft_hold_tracking (
  mint TEXT PRIMARY KEY,
  holder_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  last_owner TEXT,
  hold_started_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_holder_nft_hold_user ON holder_nft_hold_tracking (holder_user_id);

CREATE TABLE holder_reward_claims (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payout_wallet TEXT NOT NULL,
  amount_raw BIGINT NOT NULL,
  fee_lamports BIGINT NOT NULL,
  tx_signature TEXT NOT NULL UNIQUE,
  fee_tx_signature TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_holder_reward_claims_fee_tx
  ON holder_reward_claims (fee_tx_signature)
  WHERE fee_tx_signature IS NOT NULL;

CREATE INDEX idx_holder_reward_claims_user ON holder_reward_claims (user_id, created_at DESC);

CREATE TABLE holder_reward_pending_claims (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  payout_wallet TEXT NOT NULL,
  amount_raw BIGINT NOT NULL,
  fee_tx_signature TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE holder_reward_used_tx_signatures (
  tx_signature TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE holder_reward_ledger (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source VARCHAR(32) NOT NULL CHECK (source IN ('admin', 'discord_message', 'discord_reaction')),
  amount_raw BIGINT NOT NULL CHECK (amount_raw > 0),
  reward_date_et DATE NOT NULL,
  dedup_key TEXT UNIQUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_holder_reward_ledger_user_date ON holder_reward_ledger (user_id, reward_date_et DESC);
CREATE INDEX idx_holder_reward_ledger_source ON holder_reward_ledger (source, created_at DESC);

CREATE TABLE discord_engagement_daily (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reward_date_et DATE NOT NULL,
  messages_count INTEGER NOT NULL DEFAULT 0,
  reactions_count INTEGER NOT NULL DEFAULT 0,
  messages_bux_raw BIGINT NOT NULL DEFAULT 0,
  reactions_bux_raw BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, reward_date_et)
);

CREATE TABLE discord_engagement_sync_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- NFT activity alerts (Helius webhooks + GraveMarket/GraveStake sync)
CREATE TABLE IF NOT EXISTS nft_activity_processed (
  signature TEXT NOT NULL,
  mint TEXT NOT NULL,
  event_type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (signature, mint, event_type)
);

CREATE INDEX IF NOT EXISTS idx_nft_activity_processed_created ON nft_activity_processed (created_at DESC);

CREATE TABLE IF NOT EXISTS gravemarket_activity_sync_state (
  collection_slug TEXT PRIMARY KEY,
  last_event_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gravestake_activity_sync_state (
  collection_slug TEXT PRIMARY KEY,
  last_block_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prize_draws (
  id SERIAL PRIMARY KEY,
  winner_user_id INTEGER NOT NULL REFERENCES users(id),
  winner_discord_id VARCHAR(255),
  winner_discord_username VARCHAR(255),
  winner_discord_image TEXT,
  payout_wallet TEXT NOT NULL,
  prize_amount_raw BIGINT NOT NULL,
  empire_usd_price DOUBLE PRECISION,
  prize_usd_value DOUBLE PRECISION,
  tx_signature TEXT NOT NULL,
  eligible_pool_size INTEGER NOT NULL,
  drawn_by_user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prize_draws_created_at ON prize_draws (created_at DESC);

CREATE TABLE IF NOT EXISTS prize_draw_pending (
  prepared_by_user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  winner_user_id INTEGER NOT NULL REFERENCES users(id),
  winner_discord_id VARCHAR(255),
  winner_discord_username VARCHAR(255),
  winner_discord_image TEXT,
  payout_wallet TEXT NOT NULL,
  prize_amount_raw BIGINT NOT NULL,
  eligible_pool_size INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;
