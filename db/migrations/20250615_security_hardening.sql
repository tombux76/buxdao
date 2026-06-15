-- Casino: block parallel collect payouts
CREATE TABLE IF NOT EXISTS casino_pending_collects (
  wallet_address TEXT NOT NULL,
  game_type TEXT NOT NULL,
  token_used TEXT NOT NULL DEFAULT 'bux',
  amount NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (wallet_address, game_type, token_used)
);

-- Merch: verify SOL payment amount + prevent tx replay
ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_usd NUMERIC(12, 2);

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_tx_signature_unique
  ON orders (tx_signature)
  WHERE tx_signature IS NOT NULL;
