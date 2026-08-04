-- Track whether the Discord @everyone announcement posted successfully.
-- Lets confirm retries finish the announce without duplicating posts.
ALTER TABLE prize_draws
  ADD COLUMN IF NOT EXISTS discord_announced_at TIMESTAMPTZ;
