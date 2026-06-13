-- Add X link fields to users (run once on existing DBs)
ALTER TABLE users ADD COLUMN IF NOT EXISTS x_username VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS x_user_id VARCHAR(255);
