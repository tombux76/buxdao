import { Connection, PublicKey } from "@solana/web3.js";

const SOLANA_RPC = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

export function getSolanaConnection() {
  return new Connection(SOLANA_RPC);
}

export function getProjectWallet(): string {
  const wallet = process.env.PROJECT_WALLET;
  if (!wallet) {
    throw new Error("PROJECT_WALLET environment variable is required");
  }
  return wallet;
}

type VerifySolPaymentOptions = {
  projectWallet?: string;
  minLamports?: number;
  maxLamports?: number;
};

export async function verifySolPayment(
  txSignature: string,
  walletAddress: string,
  options: VerifySolPaymentOptions = {},
) {
  const projectWallet = options.projectWallet ?? getProjectWallet();
  const connection = getSolanaConnection();
  const tx = await connection.getParsedTransaction(txSignature, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  if (!tx) {
    return { ok: false as const, error: "Transaction not found" };
  }
  if (tx.meta?.err) {
    return { ok: false as const, error: "Transaction failed on chain" };
  }

  let paidLamports = BigInt(0);
  const instructions = tx.transaction.message.instructions;
  const inner = (tx.meta?.innerInstructions ?? []).flatMap((ii) => ii.instructions);
  for (const inst of [...instructions, ...inner]) {
    const parsed = "parsed" in inst ? inst.parsed : null;
    if (!parsed || parsed.type !== "transfer") continue;
    const info = parsed.info as { destination?: string; source?: string; lamports?: number };
    if (info.destination === projectWallet && info.source === walletAddress) {
      paidLamports += BigInt(info.lamports ?? 0);
    }
  }

  if (paidLamports <= BigInt(0)) {
    return { ok: false as const, error: "SOL payment to project wallet not found" };
  }

  if (options.minLamports != null && paidLamports < BigInt(options.minLamports)) {
    return {
      ok: false as const,
      error: `Insufficient SOL paid (expected at least ${options.minLamports} lamports)`,
    };
  }

  if (options.maxLamports != null && paidLamports > BigInt(options.maxLamports)) {
    return { ok: false as const, error: "SOL payment amount exceeds order total" };
  }

  return { ok: true as const, lamports: Number(paidLamports) };
}

export function getProjectWalletPublicKey(): PublicKey {
  return new PublicKey(getProjectWallet());
}

export function computeCartTotalUsd(cart: Array<{ price: number; quantity: number }>): number {
  return cart.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);
}

export function computeExpectedSolLamports(totalUsd: number, solPriceUsd: number): number {
  if (!Number.isFinite(totalUsd) || totalUsd <= 0 || !Number.isFinite(solPriceUsd) || solPriceUsd <= 0) {
    return 0;
  }
  return Math.round((totalUsd / solPriceUsd) * 1e9);
}
