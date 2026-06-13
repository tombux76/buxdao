-- Add X profile image column (run once on existing DBs)
ALTER TABLE users ADD COLUMN IF NOT EXISTS x_image TEXT;
