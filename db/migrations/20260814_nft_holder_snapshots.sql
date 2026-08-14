-- Cached NFT owner counts so leaderboard / prize-draw eligibility
-- survive Helius DAS 429s instead of collapsing to 0 holders.
CREATE TABLE IF NOT EXISTS nft_holder_snapshots (
  collection_id TEXT NOT NULL,
  wallet TEXT NOT NULL,
  nft_count INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_id, wallet)
);
