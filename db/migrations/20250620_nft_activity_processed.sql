-- Dedupe Helius NFT activity webhook deliveries
CREATE TABLE IF NOT EXISTS nft_activity_processed (
  signature TEXT NOT NULL,
  mint TEXT NOT NULL,
  event_type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (signature, mint, event_type)
);

CREATE INDEX IF NOT EXISTS idx_nft_activity_processed_created ON nft_activity_processed (created_at DESC);
