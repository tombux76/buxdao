import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { tokenConfig } from "@/content/site";
import { markHeliusKeyExhausted } from "@/lib/helius-rpc";
import { getServerRpcUrlCandidates } from "@/lib/solana/rpc-url";

const BUX_DECIMALS = 9;
const RPC_TIMEOUT_MS = 25_000;

export type BuxTokenAccountSlice = {
  owner: string;
  amount: number;
};

function rpcHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "unknown";
  }
}

function accountDataToBuffer(raw: unknown): Buffer | null {
  if (Buffer.isBuffer(raw)) {
    return raw;
  }
  if (raw instanceof Uint8Array) {
    return Buffer.from(raw);
  }
  if (Array.isArray(raw) && typeof raw[0] === "string") {
    return Buffer.from(raw[0], "base64");
  }
  if (typeof raw === "string") {
    return Buffer.from(raw, "base64");
  }
  return null;
}

function decodeOwnerAndAmount(raw: unknown): { owner: string; amount: number } | null {
  try {
    const buf = accountDataToBuffer(raw);
    if (!buf || buf.length < 40) {
      return null;
    }
    const owner = new PublicKey(buf.subarray(0, 32)).toBase58();
    const amount = Number(buf.readBigUInt64LE(32));
    return { owner, amount };
  } catch {
    return null;
  }
}

async function jsonRpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
    signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
  });

  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}`);
    if (url.includes("helius-rpc.com") && (response.status === 429 || response.status === 401)) {
      markHeliusKeyExhausted(url);
    }
    throw error;
  }

  const payload = (await response.json()) as {
    result?: T;
    error?: { message?: string };
  };

  if (payload.error) {
    const message = payload.error.message ?? "RPC error";
    if (url.includes("helius-rpc.com") && /429|max usage|rate limit|quota/i.test(message)) {
      markHeliusKeyExhausted(url);
    }
    throw new Error(message);
  }

  if (payload.result === undefined) {
    throw new Error("Invalid RPC response");
  }

  return payload.result;
}

async function withRpcFallback<T>(fn: (url: string) => Promise<T>): Promise<T> {
  const candidates = getServerRpcUrlCandidates();
  let lastError: Error | null = null;

  for (const url of candidates) {
    try {
      return await fn(url);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error("[bux-rpc]", rpcHost(url), lastError.message);
    }
  }

  throw lastError ?? new Error("RPC unavailable");
}

/**
 * All non-zero $BUX token accounts via raw JSON-RPC (public → QuikNode → Helius).
 * Avoids web3.js Connection timeouts on large getProgramAccounts responses.
 */
export async function fetchAllBuxTokenAccountsViaRpc(): Promise<BuxTokenAccountSlice[]> {
  const mint = tokenConfig.mint;

  const result = await withRpcFallback((url) =>
    jsonRpc<{ account: { data: string | [string, string] } }[]>(url, "getProgramAccounts", [
      TOKEN_PROGRAM_ID.toBase58(),
      {
        encoding: "base64",
        commitment: "confirmed",
        filters: [
          { dataSize: 165 },
          { memcmp: { offset: 0, bytes: mint } },
        ],
        dataSlice: { offset: 32, length: 40 },
      },
    ]),
  );

  const accounts: BuxTokenAccountSlice[] = [];
  for (const item of result) {
    const decoded = decodeOwnerAndAmount(item.account?.data);
    if (!decoded || decoded.amount === 0) {
      continue;
    }
    accounts.push({
      owner: decoded.owner,
      amount: decoded.amount / 10 ** BUX_DECIMALS,
    });
  }

  return accounts;
}

/** $BUX balance for one wallet via raw JSON-RPC (not Helius-only). */
export async function fetchWalletBuxBalanceViaRpc(wallet: string): Promise<number> {
  const mint = tokenConfig.mint;

  const result = await withRpcFallback((url) =>
    jsonRpc<{ value: { account: { data: { parsed?: { info?: { tokenAmount?: { uiAmount?: number | null } } } } } }[] }>(
      url,
      "getTokenAccountsByOwner",
      [
        wallet,
        { mint },
        { encoding: "jsonParsed", commitment: "confirmed" },
      ],
    ),
  );

  let total = 0;
  for (const item of result.value ?? []) {
    const amount = item.account?.data?.parsed?.info?.tokenAmount?.uiAmount;
    if (typeof amount === "number") {
      total += amount;
    }
  }
  return total;
}
