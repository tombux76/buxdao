-- Remember fee tx on pending claims so refresh cannot prompt a second SOL payment.

ALTER TABLE holder_reward_pending_claims
  ADD COLUMN IF NOT EXISTS fee_tx_signature TEXT;
