# Discord live stats (voice channels)

Display **liquidity wallet balance**, **public $BUX supply**, and **live token value** in your server sidebar by renaming locked voice channels. This is the same pattern used by many DeFi and NFT communities — the channels are display-only; nobody joins them.

## How it works

1. You create **three voice channels** in Discord (e.g. under a `$BUX Stats` category).
2. Deny **Connect** for `@everyone` so they act as labels, not call rooms.
3. The BUXDAO bot renames those channels on a schedule using the same metrics as `/bux` and Holder Hub.
4. A cron job hits `GET /api/discord/stats-channels/sync` every **10–15 minutes** (Discord rate-limits channel renames).

Example channel names after sync:

| Channel | Example name |
|---------|----------------|
| Wallet | `Liquidity · 34.97 SOL` |
| Supply | `Public supply · 842.3k $BUX` |
| Value | `Token value · 0.00091 SOL` |

## One-time Discord setup

1. **Bot permissions** — Your app bot (`DISCORD_BOT_TOKEN`) needs **Manage Channels** on the server (or on the stats category).
2. **Create channels** — Three voice channels, any starting names (they will be overwritten).
3. **Lock them** — Channel settings → Permissions → `@everyone` → **Connect: Deny** (View Channel can stay allowed).
4. **Copy channel IDs** — User Settings → Advanced → Developer Mode → right-click each channel → Copy Channel ID.

## Env vars

Add to Vercel / `.env`:

```env
DISCORD_STATS_WALLET_CHANNEL_ID=<voice channel id>
DISCORD_STATS_SUPPLY_CHANNEL_ID=<voice channel id>
DISCORD_STATS_VALUE_CHANNEL_ID=<voice channel id>
```

Uses existing `DISCORD_BOT_TOKEN`, `HELIUS_API_KEY`, `SOLANA_RPC_URL`, and `POSTGRES_URL` (for unclaimed supply in metrics).

Cron auth reuses `HOLDER_REWARDS_CRON_SECRET`.

## Cron (external scheduler)

Same pattern as GraveStake / engagement sync — e.g. [cron-job.org](https://cron-job.org) every **10 minutes**:

```http
GET https://www.buxdao.com/api/discord/stats-channels/sync
Authorization: Bearer <HOLDER_REWARDS_CRON_SECRET>
```

Or `?key=<secret>` on GET.

**Do not run more often than every ~10 minutes** — Discord limits how often channel names can change.

## Manual test

```bash
curl -s "https://www.buxdao.com/api/discord/stats-channels/sync?key=$HOLDER_REWARDS_CRON_SECRET" | jq
```

Response includes `updated` / `skipped` per channel and the metric snapshot used.

## Key files

| File | Role |
|------|------|
| `src/lib/discord/stats-channels.ts` | Fetch metrics, format names, PATCH Discord channels |
| `src/app/api/discord/stats-channels/sync/route.ts` | Cron-protected sync endpoint |
| `src/lib/bux/metrics.ts` | Same token value math as the site |
