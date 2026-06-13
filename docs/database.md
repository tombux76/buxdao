# Database (Neon Postgres)

Single unified database for auth, wallets, merch, casino, and cashout.

## Setup

```bash
# Apply schema
psql "$POSTGRES_URL" -f db/schema.sql

# Optional: seed legacy airdrop audit rows
psql "$POSTGRES_URL" -f db/seed-legacy-airdrops.sql
```

Set **`POSTGRES_URL`** on Vercel (and locally). Casino API uses `CASINO_DATABASE_URL` first, then **`POSTGRES_URL`**, then `DATABASE_URL`.

**Important:** If `CASINO_DATABASE_URL` points at a different/empty Neon project, casino saves will go to the wrong database. Either unset it on Vercel or set it to the **same** connection string as `POSTGRES_URL`.

Apply schema once:

```bash
npm run db:schema
# or: psql "$POSTGRES_URL" -f db/schema.sql
```

## Tables

| Area | Tables |
|------|--------|
| **Auth.js** | `users`, `accounts`, `sessions`, `verification_token` |
| **Wallets** | `user_wallets`, `wallet_link_challenges` |
| **Discord roles** | `discord_role_catalog` (display metadata only) |
| **Merch** | `orders` |
| **Cashout** | `cashout_transactions` |
| **Legacy airdrop** | `legacy_reward_airdrops` |
| **Casino** | `slots_*`, `coinflip_*`, `roulette_*`, `casino_daily_totals` |

Wallet → Discord name lookups use a join in app code (`user_wallets` → `users` → `accounts`), not a DB view.

## User profile columns

| Column | Purpose |
|--------|---------|
| `discord_id`, `discord_username`, `discord_image` | Discord identity (required login) |
| `x_user_id`, `x_username`, `x_image` | Optional linked X |
| `email`, `emailVerified` | Auth.js only (often null for Discord) |

Auth.js `User.name` / `User.image` are mapped from `discord_username` / `discord_image` in our custom adapter (`src/lib/auth/pg-adapter.ts`).

## Clean slate — no old data migration

**Do not import** users, wallets, or orders from the old site.

| Data | Approach |
|------|----------|
| **Users & wallets** | Created only when someone logs in on the new site and links a wallet |
| **Merch orders** | New orders only — past Printful orders are ignored |
| **Casino stats** | Fresh — players accumulate from first play on v2 |
| **Legacy unclaimed $BUX** | One-time airdrop only — `legacy_reward_airdrops` + CSV in `docs/` (not live user accounts) |

This keeps `users.created_at` / `sessions` as a true picture of **who is currently active** on the new site.

## Auth flow

- **Discord** — primary login via Auth.js. Snowflake stored on `users.discord_id` (denormalized from `accounts.providerAccountId`). Profile name/avatar synced on login and hub load.
- **X** — link second account after Discord login (`provider = 'twitter'`). Requires `AUTH_TWITTER_ID` / `AUTH_TWITTER_SECRET`.
- **Wallet** — signed message against `wallet_link_challenges`, insert `user_wallets`
- **Discord roles (Hub)** — bot fetches member role IDs from Discord; `discord_role_catalog` maps role IDs to display name, color, and emoji (no per-user role storage)

### Discord role catalog

Populate once from your verification role IDs (e.g. export from the old `roles` table):

```sql
INSERT INTO discord_role_catalog (discord_role_id, display_name, color, emoji_url, sort_order)
VALUES ('123456789012345678', 'MONSTER', '#14f195', 'https://…', 1);
```

Requires `DISCORD_BOT_TOKEN` and `DISCORD_GUILD_ID` for a **display-only** bot in your BUXDAO Discord server (not the GraveKeeper verification bot — that service assigns roles; this bot only reads member roles for the Hub UI). The bot needs permission to view the server and read member role lists.

Seed catalog: `npm run db:seed-roles` (or `node scripts/db-migrate.mjs db/seed-discord-role-catalog.sql`)

### Discord app setup

1. [Discord Developer Portal](https://discord.com/developers/applications) → New Application → OAuth2
2. Redirect URL: `http://localhost:3000/api/auth/callback/discord` (and production URL)
3. Copy Client ID → `AUTH_DISCORD_ID`, Client Secret → `AUTH_DISCORD_SECRET`
4. Generate secret: `openssl rand -base64 32` → `AUTH_SECRET`

### X app setup (optional)

1. [X Developer Portal](https://developer.x.com/en/portal/dashboard) → your app → **User authentication settings**
2. Enable **OAuth 2.0**, type **Web App**
3. Callback URL: `http://localhost:3000/api/auth/callback/twitter` (and production URL)
4. Copy Client ID → `AUTH_TWITTER_ID`, Client Secret → `AUTH_TWITTER_SECRET`
5. Apply DB migration: `psql "$POSTGRES_URL" -f db/migrations/20250613_users_x_link.sql`

X can only be linked while logged in with Discord — standalone X login is blocked.

### Active members query

```sql
SELECT u.id, u.discord_id, u.discord_username, u.created_at, u.updated_at
FROM users u
WHERE u.discord_id IS NOT NULL
ORDER BY u.updated_at DESC;
```

## Env vars

```env
POSTGRES_URL=
CASINO_DATABASE_URL=   # same as POSTGRES_URL
AUTH_SECRET=
AUTH_DISCORD_ID=
AUTH_DISCORD_SECRET=
DISCORD_BOT_TOKEN=
DISCORD_GUILD_ID=
AUTH_TWITTER_ID=
AUTH_TWITTER_SECRET=
```
