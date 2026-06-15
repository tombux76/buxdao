-- Prevent replay of on-chain purchase txs for casino credits
CREATE TABLE IF NOT EXISTS casino_used_tx_signatures (
  signature TEXT PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  game_type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_casino_used_tx_wallet ON casino_used_tx_signatures (wallet_address, created_at DESC);
