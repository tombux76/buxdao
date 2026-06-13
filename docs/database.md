# Database (Neon Postgres)

Single unified database for auth, wallets, merch, casino, and cashout.

## Setup

```bash
# Apply schema
psql "$POSTGRES_URL" -f db/schema.sql

# Optional: seed legacy airdrop audit rows
psql "$POSTGRES_URL" -f db/seed-legacy-airdrops.sql
```

Set **`POSTGRES_URL`** and **`CASINO_DATABASE_URL`** to the same connection string (casino API reads `CASINO_DATABASE_URL` first).

## Tables

| Area | Tables |
|------|--------|
| **Auth.js** | `users`, `accounts`, `sessions`, `verification_token` |
| **Wallets** | `user_wallets`, `wallet_link_challenges` |
| **Merch** | `orders` |
| **Cashout** | `cashout_transactions` |
| **Legacy airdrop** | `legacy_reward_airdrops` |
| **Casino** | `slots_*`, `coinflip_*`, `roulette_*`, `casino_daily_totals` |

View **`wallet_discord`** — joins `user_wallets` → `users` → Discord `accounts` for leaderboard names.

## Auth flow (next step)

- **Discord** — primary login via Auth.js (`provider = 'discord'`)
- **X** — link second account (`provider = 'twitter'` or `'x'`) on same `users.id`
- **Wallet** — signed message against `wallet_link_challenges`, insert `user_wallets`

## Migrating from old DBs

**Old main DB (us-east-2):** export `user_wallets` → create `users` + `accounts` stubs + `user_wallets`; copy `orders`.

**Old casino DB (eu-west-2):** pg_dump game tables only (`slots_*`, `coinflip_*`, `roulette_*`, `casino_daily_totals`).

Users who log in via Discord before migration will get new `users` rows; merge on `accounts.providerAccountId` = old `discord_id`.

## Env vars (auth — add when implementing)

```env
POSTGRES_URL=
CASINO_DATABASE_URL=   # same as POSTGRES_URL
AUTH_SECRET=             # openssl rand -base64 32
AUTH_DISCORD_ID=
AUTH_DISCORD_SECRET=
AUTH_TWITTER_ID=
AUTH_TWITTER_SECRET=
```
