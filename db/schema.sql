-- BUXDAO v2 — unified Postgres schema
-- Auth.js (Discord + X) · wallet links · merch · casino · cashout · legacy airdrops

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Auth.js adapter tables (https://authjs.dev/getting-started/adapters/pg)
-- ---------------------------------------------------------------------------

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255),
  email VARCHAR(255) UNIQUE,
  "emailVerified" TIMESTAMPTZ,
  image TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
  tx_signature TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_cashout_transactions_user_id ON cashout_transactions (user_id);
CREATE INDEX idx_cashout_transactions_status ON cashout_transactions (status, created_at DESC);

-- ---------------------------------------------------------------------------
-- Legacy staking unclaimed — one-time airdrop audit trail
-- ---------------------------------------------------------------------------

CREATE TABLE legacy_reward_airdrops (
  id BIGSERIAL PRIMARY KEY,
  discord_id TEXT NOT NULL UNIQUE,
  discord_username TEXT,
  amount_bux BIGINT NOT NULL,
  destination_wallet TEXT,
  wallet_resolution TEXT NOT NULL DEFAULT 'pending',
  airdrop_tx_signature TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);

CREATE INDEX idx_legacy_reward_airdrops_status ON legacy_reward_airdrops (status);

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

-- Discord display name for leaderboards / BUX page
CREATE OR REPLACE VIEW wallet_discord AS
SELECT
  uw.wallet_address,
  uw.user_id,
  uw.is_primary,
  a."providerAccountId" AS discord_id,
  u.name AS discord_username
FROM user_wallets uw
JOIN users u ON u.id = uw.user_id
LEFT JOIN accounts a ON a."userId" = u.id AND a.provider = 'discord';

COMMIT;
