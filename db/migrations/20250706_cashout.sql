-- Cashout: pending claims, used signatures, extended transaction ledger

CREATE TABLE IF NOT EXISTS cashout_pending_claims (
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

CREATE TABLE IF NOT EXISTS cashout_used_signatures (
  tx_signature TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE cashout_transactions
  ADD COLUMN IF NOT EXISTS fee_lamports BIGINT,
  ADD COLUMN IF NOT EXISTS bux_tx_signature TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cashout_transactions_bux_tx
  ON cashout_transactions (bux_tx_signature)
  WHERE bux_tx_signature IS NOT NULL;
