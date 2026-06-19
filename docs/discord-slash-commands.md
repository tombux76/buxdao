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
   - `POSTGRES_URL` (for `/profile`)
   - `GRAVEMARKET_API_KEY` (for `/collections` market stats)
   - `AUTH_DISCORD_ID` (application id — already used for OAuth)
   - `DISCORD_BOT_TOKEN` (unchanged — Hub role display)
4. Optional: `DISCORD_ADMIN_ROLE_IDS` — comma-separated role IDs allowed to use `/profile` with another user.

## Registered commands (global)

| Command | Data source |
|---------|-------------|
| `/nft` | Helius DAS collection index + live owner |
| `/rank` | HowRare.is rank → Helius owner + image |
| `/collections` | GraveMarket + Helius supply |
| `/profile` | Hub-linked wallets + on-chain $BUX / NFTs |
| `/addclaim` | Admin credit to Hub-linked user's claim account |
| `/help` | Static command list |

Legacy `/collections` choices were removed — re-register commands after deploy (see below).

## Register / update commands

```bash
npm run discord-register-commands
```

## List registered commands

```bash
npm run discord-list-commands
```

## Register / update global commands

Replaces all global slash commands (5 active collections only — no AI collab collections):

```bash
npm run discord-register-commands
# preview payload:
npm run discord-register-commands -- --dry-run
```

Command definitions: `data/discord/slash-commands.json`

## Key files

| File | Role |
|------|------|
| `src/app/api/discord/interactions/route.ts` | Webhook handler |
| `src/app/api/discord-interactions/route.ts` | Same handler (legacy URL path) |
| `src/lib/discord/handlers.ts` | Command logic |
| `src/lib/discord/collection-index.ts` | Token # / rank → mint (cached) |
| `src/lib/discord/user-data.ts` | Discord ID → Hub wallets |

## Notes

- First `/nft` call per collection may take several seconds (builds index from chain). `/rank` loads HowRare.is rarity once per collection (~1–3s), then caches for ~1h on the same instance.
- Users must link wallets on [Holder Hub](/hub) for profile commands.
- Command definitions are **not** re-registered by this repo — they remain as registered on the old site. Update via Discord API only if command shapes change.
