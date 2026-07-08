# GraveStake pools & BUX holder metrics

**Production staking:** [GraveStake](https://gravestake.io) — see `/staking` on the site.

**In-house daily rewards** (wallet-held NFTs, Hub-linked wallets) are **on hold** — built but not launched. See **[holder-daily-rewards.md](./holder-daily-rewards.md)** for status, spec, and resume checklist.

---

When a collection’s staking pool goes live on GraveStake, update **`src/content/site.ts`** in the matching `collectionConfigs` entry:

```ts
{
  id: "money-monsters", // example
  // ...
  graveStakeUrl: "https://gravestake.io/p/money-monsters",
  stakeLive: true,
  stakingWallet: "PASTE_POOL_WALLET_FROM_GRAVESTAKE",
  dailyBuxYield: 5,
}
```

## Currently live

| Collection       | GraveStake link                                      | Staking wallet |
|------------------|------------------------------------------------------|----------------|
| Fcked Catz       | https://gravestake.io/p/fcked-catz                   | `9ykXGCGJF8LL3MRMmhrhDtXKfKXpaY1NcJeJQWAPCpfz` |
| Celebrity Catz   | https://gravestake.io/p/celebrity-catz               | `7rJDJYRbG4pU9QyCaYMJjrjLs6E9C46NpCDguQGhWNMR` |
| Money Monsters   | https://gravestake.io/p/money-monsters               | `AbRPmEHSAubSktYYeuqdXXsnbww1VrzZogkhQgw5iDa7` |
| A.I. BitBots     | https://gravestake.io/p/ai-bitbots                   | `41bBHw4CsbzYv2wHVthm5FbQx7UX7TLRr8tEZTnXHrJt` |
| Money Monsters 3D| https://gravestake.io/p/money-monsters-3d            | `HWZaTrurJvXwNpXXVSYD3sc1vceVyjDLi4e1LFydGaQ` |

All five collection pools are now live on GraveStake.

## What the code does automatically

Once `stakingWallet` is set on a collection:

1. **NFT holder table** — NFTs in the pool wallet are **not** counted for the pool. Each mint is attributed to the wallet that transferred it in (Helius tx history via `src/lib/bux/staking-attribution.ts`).
2. **BUX holder table** — The pool wallet is **hidden** (same as project/treasury wallets in `tokenConfig.exemptWallets`).
3. **Token metrics** — $BUX held by the pool wallet is **exempt supply**, not public supply (affects token value calculation).

## Project wallets (always hidden)

These are in `tokenConfig.exemptWallets` and are never shown on holder tables:

- `FYfLzXckAf2JZoMYBz2W4fpF9vejqpA6UFV17d1A7C75` — BUX treasury
- `1BWutmTvYPwDtmw9abTkS4Ssr8no61spGAvW1X6NDix` — Magic Eden V2 authority / escrow

Staking pool wallets are configured per collection via `stakingWallet` and are excluded automatically.

## Key files

| File | Role |
|------|------|
| `src/content/site.ts` | `collectionConfigs`, `tokenConfig.exemptWallets` |
| `src/lib/bux/helius-holders.ts` | On-chain scan, hidden wallets, NFT attribution |
| `src/lib/bux/staking-attribution.ts` | Mint → depositor map from Helius |
| `src/lib/bux/metrics.ts` | Public vs exempt supply |
| `src/lib/bux/top-holders.ts` | Leaderboard API |

No API or env changes are required when adding a new pool—only `site.ts`.
