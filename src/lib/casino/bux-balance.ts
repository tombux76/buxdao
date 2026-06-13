import { tokenConfig } from "@/content/site";

const HELIUS_RPC = "https://mainnet.helius-rpc.com";
const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

async function heliusRpc<T>(method: string, params: unknown): Promise<T | null> {
  const apiKey = process.env.HELIUS_API_KEY;
  if (!apiKey) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(`${HELIUS_RPC}/?api-key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "1", method, params }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as { result?: T };
    return payload.result ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

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

export function getCasinoRpcUrl(): string {
  if (process.env.HELIUS_API_KEY?.trim()) {
    return `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(process.env.HELIUS_API_KEY.trim())}`;
  }
  return (
    process.env.SOLANA_RPC_URL?.trim() ||
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim() ||
    "https://api.mainnet-beta.solana.com"
  );
}

export function isValidSolanaWallet(address: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address.trim());
}
