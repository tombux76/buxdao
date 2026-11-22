-- Durable HowRare.is rarity ranks so Discord /rank and /nft do not wait ~40s
-- on every cold start for large collections (e.g. fckedcatz).
CREATE TABLE IF NOT EXISTS howrare_rank_cache (
  collection_id TEXT NOT NULL,
  token_number INTEGER NOT NULL,
  mint TEXT NOT NULL,
  rank INTEGER NOT NULL,
  link TEXT NOT NULL DEFAULT '',
  rank_algo TEXT NOT NULL DEFAULT 'howrare.is',
  all_ranks JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_id, token_number)
);

CREATE INDEX IF NOT EXISTS howrare_rank_cache_by_rank
  ON howrare_rank_cache (collection_id, rank);

CREATE INDEX IF NOT EXISTS howrare_rank_cache_by_mint
  ON howrare_rank_cache (collection_id, mint);
