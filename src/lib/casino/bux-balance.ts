import { tokenConfig } from "@/content/site";
import { getHeliusRpcUrlCandidates, heliusRpc } from "@/lib/helius-rpc";

const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

/** Whole $BUX balance for a wallet (9 decimals). */
export async function fetchCasinoBuxBalance(wallet: string): Promise<number> {
  const mint = process.env.BUX_TOKEN_MINT?.trim() || tokenConfig.mint;
  const result = await heliusRpc<{ account: { data: string | [string, string] } }[]>(
    "getProgramAccounts",
    [
      TOKEN_PROGRAM_ID,
      {
        encoding: "base64",
        commitment: "confirmed",
        filters: [
          { dataSize: 165 },
          { memcmp: { offset: 0, bytes: mint } },
          { memcmp: { offset: 32, bytes: wallet } },
        ],
      },
    ],
    { softFail: true, timeoutMs: 30_000 },
  );

  if (!result?.length) {
    return 0;
  }

  let total = 0;
  for (const item of result) {
    const raw = item.account?.data;
    if (!raw) continue;
    const dataBase64 = Array.isArray(raw) ? raw[0] : raw;
    try {
      const buf = Buffer.from(dataBase64, "base64");
      if (buf.length >= 72) {
        total += Number(buf.readBigUInt64LE(64));
      }
    } catch {
      // skip malformed account
    }
  }

  const decimals = Number.parseInt(process.env.BUX_TOKEN_DECIMALS ?? "9", 10);
  return total / 10 ** decimals;
}

/** Server-side RPC (may include Helius API key). Never expose to the browser. */
export function getCasinoRpcUrl(): string {
  const heliusUrls = getHeliusRpcUrlCandidates();
  if (heliusUrls.length > 0) {
    return heliusUrls[0]!;
  }
  return (
    process.env.SOLANA_RPC_URL?.trim() ||
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim() ||
    "https://api.mainnet-beta.solana.com"
  );
}

/** Browser-safe RPC — same-origin proxy (no API keys, no CORS). */
export function getPublicCasinoRpcUrl(): string {
  return "/api/solana/rpc";
}

export function isValidSolanaWallet(address: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address.trim());
}
