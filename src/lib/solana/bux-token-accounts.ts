import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { tokenConfig } from "@/content/site";
import { withServerConnection } from "@/lib/solana/server-rpc";

const BUX_DECIMALS = 9;

export type BuxTokenAccountSlice = {
  owner: string;
  amount: number;
};

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
    // dataSlice returns owner(32) + amount(8) = 40 bytes
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

/**
 * All non-zero $BUX token accounts via standard JSON-RPC (public → QuikNode → Helius).
 * Does not depend on Helius DAS credits.
 */
export async function fetchAllBuxTokenAccountsViaRpc(): Promise<BuxTokenAccountSlice[]> {
  const mint = tokenConfig.mint;

  const result = await withServerConnection(
    (connection) =>
      connection.getProgramAccounts(TOKEN_PROGRAM_ID, {
        encoding: "base64",
        commitment: "confirmed",
        filters: [
          { dataSize: 165 },
          { memcmp: { offset: 0, bytes: mint } },
        ],
        dataSlice: { offset: 32, length: 40 },
      }),
    { timeoutMs: 30_000 },
  );

  const accounts: BuxTokenAccountSlice[] = [];
  for (const item of result) {
    const decoded = decodeOwnerAndAmount(item.account.data);
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

/** $BUX balance for one wallet via standard JSON-RPC (not Helius-only). */
export async function fetchWalletBuxBalanceViaRpc(wallet: string): Promise<number> {
  const mint = new PublicKey(tokenConfig.mint);
  const owner = new PublicKey(wallet);

  return withServerConnection(
    async (connection) => {
      const response = await connection.getParsedTokenAccountsByOwner(owner, { mint });
      let total = 0;
      for (const { account } of response.value) {
        const amount = account.data.parsed?.info?.tokenAmount?.uiAmount;
        if (typeof amount === "number") {
          total += amount;
        }
      }
      return total;
    },
    { timeoutMs: 20_000 },
  );
}
