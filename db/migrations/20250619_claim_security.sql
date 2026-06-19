-- Idempotent claim completion + fee tx tracking on completed claims.

ALTER TABLE holder_reward_claims
  ADD COLUMN IF NOT EXISTS fee_tx_signature TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_holder_reward_claims_fee_tx
  ON holder_reward_claims (fee_tx_signature)
  WHERE fee_tx_signature IS NOT NULL;
