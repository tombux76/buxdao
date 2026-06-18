# Holder daily rewards (BUXDAO-built)

**Status: ON HOLD** — June 2026. Continuing with [GraveStake](https://gravestake.io) for staking.

## Why on hold

GraveStake has optimised their fee structure. ~**98% of user costs are refundable rent fees** that are recouped automatically when users unstake. Given that, we are **not** switching back to the in-house daily rewards model for now. `/staking` remains the public staking path; GraveStake stays the production system.

Revisit this doc if fees, holder experience, or $BUX economics change.

---

## Product intent (locked when paused)

| Topic | Decision |
|--------|----------|
| Claim account | One per Discord user (sum all linked wallets) |
| Who earns | Hub-linked wallets only |
| GraveStake NFTs | **Wallet-held only** — staked in GraveStake pools do **not** count |
| Collections | All 5 in `collectionConfigs` (`src/content/site.ts`) |
| Base yields | `dailyBuxYield` per NFT, no lock multipliers (FC 10, MM 5, AIBB 5, MM3D 10, Celeb 20) |
| Accrual time | Midnight **America/New_York** snapshot |
| Testing vs launch | Accrue during dev; **zero all balances** on production go-live |
| Claim tx | User signs (fee payer); treasury co-signs BUX transfer |
| Payout wallet | Currently connected wallet (must be linked) |
| Treasury | Same as casino: `TREASURY_WALLET` / `TREASURY_PRIVATE_KEY` |
| Min claim | Any positive balance |
| Claim fee | **0.0005 SOL** platform fee → `PROJECT_WALLET` |
| UI | `/rewards` — **not in nav**; would replace `/staking` at go-live |
| Multiplier stacking | Multiply all: `base × trait/rank × loyalty` |
| Listing / escrow | Listing resets loyalty to 1.0× when NFT returns |
| Legacy code | Rebuilt from scratch (not ported from old site) |

### Bonus rules

1. **Fcked Catz branded merch clothing — 2×** — rarest 8 partner `Clothes` traits (104 NFTs). Mint list: `data/rewards/fcked-catz-branded-merch-mints.json`
2. **Top 10 ranked — 4×** — Money Monsters + MM3D. Mints: `data/rewards/money-monsters-top10-mints.json`, `data/rewards/money-monsters-3d-top10-mints.json`
3. **Long-term holder loyalty** — per NFT, wallet-held, no listing: 30d → 1.1×, +0.1× every 30d, cap **3.0×**. Resets when NFT goes to ME escrow (`tokenConfig.exemptWallets`).

---

## What is built (commit `355a092` on `main`)

### Database

Migration: `db/migrations/20250616_holder_rewards.sql` (also in `db/schema.sql`)

| Table | Purpose |
|-------|---------|
| `holder_reward_accounts` | Per-user unclaimed / total claimed (raw BUX, 9 decimals) |
| `holder_reward_accruals` | One row per user per `reward_date_et` + JSON breakdown |
| `holder_nft_hold_tracking` | Per-mint loyalty / hold start / last owner |
| `holder_reward_claims` | Completed claim history |
| `holder_reward_pending_claims` | In-flight claim lock |
| `holder_reward_used_tx_signatures` | Tx dedup |

Apply on a new environment:

```bash
node scripts/db-migrate.mjs db/migrations/20250616_holder_rewards.sql
```

### Application code

| Area | Location |
|------|----------|
| Core libs | `src/lib/holder-rewards/` |
| APIs | `src/app/api/holder-rewards/` (state, accrue, claim prepare/confirm, admin reset) |
| UI | `src/app/rewards/page.tsx`, `src/components/rewards/RewardsDashboard.tsx` |
| Accrual script | `scripts/holder-rewards-accrue.ts` (`npm run holder-rewards-accrue`) |
| GitHub Action | `.github/workflows/holder-rewards-accrue.yml` — daily 05:05 UTC |

### Feature flag

Everything is gated by **`HOLDER_REWARDS_ENABLED`** (`true` / `1` / `yes`). Default in `.env.example` is `false`. With flag off, `/rewards` APIs return 404 and the public page shows “not enabled”.

---

## Current production posture

- **GraveStake** — active; `/staking` in nav unchanged.
- **Daily rewards** — code shipped but **not live** until flag + go-live steps below.
- **GitHub Action** — if repo secrets `POSTGRES_URL` and `HELIUS_API_KEY` are set, the workflow **will accrue** (script forces `HOLDER_REWARDS_ENABLED=true`). **Disable the workflow** in GitHub (**Actions → Holder rewards accrual → ⋮ → Disable workflow**) until we resume, or remove secrets.

---

## Resume / go-live checklist

1. Reconfirm product rules and yields with stakeholders.
2. Confirm GraveStake vs in-house decision still stands.
3. Run migration on target DB if not already applied.
4. Set Vercel env: `HOLDER_REWARDS_ENABLED=true`, treasury/project wallets, `HELIUS_API_KEY`.
5. Enable GitHub Action; ensure secrets `POSTGRES_URL`, `HELIUS_API_KEY`.
6. **Zero dev accruals** before public launch:
   ```bash
   curl -X POST https://buxdao.com/api/holder-rewards/admin/reset-balances \
     -H "Authorization: Bearer $HOLDER_REWARDS_CRON_SECRET"
   ```
7. Smoke-test: link wallet on Hub → `/rewards` → manual accrual → claim flow.
8. Nav: point **Staking** to `/rewards` (or replace `/staking` content); remove or redirect old GraveStake-first copy as needed.
9. Communicate to holders (wallet-held vs staked rules, bonuses, claim fee).

### Manual accrual (dev / catch-up)

```bash
npm run holder-rewards-accrue
# specific ET date:
npx tsx scripts/holder-rewards-accrue.ts --date 2026-06-11
```

Or trigger **Actions → Holder rewards accrual → Run workflow** (optional `reward_date_et` input).

---

## Key files (quick reference)

| File | Role |
|------|------|
| `src/content/site.ts` | `collectionConfigs`, yields, staking wallets, `exemptWallets` |
| `src/lib/holder-rewards/accrual.ts` | Daily accrual job |
| `src/lib/holder-rewards/claim.ts` | Prepare / confirm claim txs |
| `src/lib/holder-rewards/multipliers.ts` | Trait / rank mint sets |
| `src/lib/holder-rewards/hold-tracking.ts` | Loyalty + escrow reset |
| `src/lib/hub/wallet-link.ts` | Linked wallet auth |
| `src/lib/solana/treasury.ts` | Treasury BUX transfers (casino pattern) |

See also **[staking-and-holders.md](./staking-and-holders.md)** for GraveStake pool configuration (still the live staking system).
