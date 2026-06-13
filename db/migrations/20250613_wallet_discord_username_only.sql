-- Use provider-specific Discord username only (no fallback to Auth.js name)
CREATE OR REPLACE VIEW wallet_discord AS
SELECT
  uw.wallet_address,
  uw.user_id,
  uw.is_primary,
  COALESCE(u.discord_id, a."providerAccountId") AS discord_id,
  u.discord_username
FROM user_wallets uw
JOIN users u ON u.id = uw.user_id
LEFT JOIN accounts a ON a."userId" = u.id AND a.provider = 'discord';
