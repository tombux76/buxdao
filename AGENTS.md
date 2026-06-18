<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## BUX holder metrics & GraveStake

See **[docs/staking-and-holders.md](./docs/staking-and-holders.md)** before enabling staking on Money Monsters, A.I. BitBots, or Money Monsters 3D. Pool wallets must be set on each `collectionConfigs` entry in `src/content/site.ts`.

**In-house daily rewards** (`/rewards`) are on hold — code on `main`, not live. **[docs/holder-daily-rewards.md](./docs/holder-daily-rewards.md)**.

## Database

Unified Postgres schema (auth, wallets, merch, casino): **[docs/database.md](./docs/database.md)**. Apply with `npm run db:schema`.
