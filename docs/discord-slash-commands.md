# Discord slash commands

BUXDAO slash commands are handled by the **Interactions Endpoint** on the Next.js app (no separate bot process). Commands are registered globally on application `1326719755779969044`.

## Setup (one-time)

1. [Discord Developer Portal](https://discord.com/developers/applications) → your app → **General Information**
   - Copy **Public Key** → `DISCORD_PUBLIC_KEY` in Vercel / `.env`
2. Same app → **General Information** → **Interactions Endpoint URL** (keep existing if already set):
   ```
   https://api.buxdao.com/api/discord-interactions
   ```
   Also works on the main domain: `https://buxdao.com/api/discord-interactions` or `/api/discord/interactions`.
   Discord sends a PING to verify — requires `DISCORD_PUBLIC_KEY` on the deployment that serves `api.buxdao.com`.
3. Ensure these env vars are set on Vercel:
   - `DISCORD_PUBLIC_KEY`
   - `HELIUS_API_KEY`
   - `POSTGRES_URL` (for `/profile`, `/mybux`, `/mynfts`)
   - `GRAVEMARKET_API_KEY` (for `/collections` market stats)
   - `AUTH_DISCORD_ID` (application id — already used for OAuth)
   - `DISCORD_BOT_TOKEN` (unchanged — Hub role display)
4. Optional: `DISCORD_ADMIN_ROLE_IDS` — comma-separated role IDs allowed to use `/profile`, `/mybux`, `/mynfts` with another user.

## Registered commands (global)

| Command | Data source |
|---------|-------------|
| `/nft` | Helius DAS collection index + live owner |
| `/rank` | Helius metadata `Rank` / `Rarity Rank` traits |
| `/collections` | GraveMarket + Helius supply |
| `/profile` | Hub-linked wallets + on-chain $BUX / NFTs |
| `/mybux` | On-chain $BUX + cashout pool metrics |
| `/mynfts` | Helius wallet holdings (+ GraveStake attribution) |
| `/addclaim` | Disabled (returns message — use GraveStake) |
| `/help` | Static command list |

Legacy `/collections` choices (Energy Apes, Rejected Bots, etc.) return a “retired collection” message.

## List registered commands

```bash
node scripts/discord-list-commands.mjs
```

## Key files

| File | Role |
|------|------|
| `src/app/api/discord/interactions/route.ts` | Webhook handler |
| `src/app/api/discord-interactions/route.ts` | Same handler (legacy URL path) |
| `src/lib/discord/handlers.ts` | Command logic |
| `src/lib/discord/collection-index.ts` | Token # / rank → mint (cached) |
| `src/lib/discord/user-data.ts` | Discord ID → Hub wallets |

## Notes

- First `/nft` or `/rank` call per collection may take several seconds (builds index from chain). Subsequent calls use in-memory cache on the same instance.
- Users must link wallets on [Holder Hub](/hub) for profile commands.
- Command definitions are **not** re-registered by this repo — they remain as registered on the old site. Update via Discord API only if command shapes change.
