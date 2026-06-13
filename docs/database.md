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

## Clean slate — no old data migration

**Do not import** users, wallets, or orders from the old site.

| Data | Approach |
|------|----------|
| **Users & wallets** | Created only when someone logs in on the new site and links a wallet |
| **Merch orders** | New orders only — past Printful orders are ignored |
| **Casino stats** | Fresh — players accumulate from first play on v2 |
| **Legacy unclaimed $BUX** | One-time airdrop only — `legacy_reward_airdrops` + CSV in `docs/` (not live user accounts) |

This keeps `users.created_at` / `sessions` as a true picture of **who is currently active** on the new site.

## Auth flow (next step)

- **Discord** — primary login via Auth.js (`provider = 'discord'`)
- **X** — link second account (`provider = 'twitter'` or `'x'`) on same `users.id`
- **Wallet** — signed message against `wallet_link_challenges`, insert `user_wallets`

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
