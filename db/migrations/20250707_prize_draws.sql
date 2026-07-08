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

-- Winner selected at "prepare" time; recorded once the prize-wallet owner signs & confirms.
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
