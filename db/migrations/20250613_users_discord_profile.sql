-- Denormalized Discord profile fields on users (run once on existing DBs)
ALTER TABLE users ADD COLUMN IF NOT EXISTS discord_id VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS discord_username VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS discord_image TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_discord_id ON users (discord_id) WHERE discord_id IS NOT NULL;

-- Backfill discord_id from Auth.js accounts
UPDATE users u
SET discord_id = a."providerAccountId"
FROM accounts a
WHERE a."userId" = u.id
  AND a.provider = 'discord'
  AND u.discord_id IS NULL;
