-- Drop redundant Auth.js display columns and wallet_discord view
ALTER TABLE users DROP COLUMN IF EXISTS name;
ALTER TABLE users DROP COLUMN IF EXISTS image;
DROP VIEW IF EXISTS wallet_discord;
