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

export async function verifySolPayment(
  txSignature: string,
  walletAddress: string,
  projectWallet = getProjectWallet(),
) {
  const connection = getSolanaConnection();
  const tx = await connection.getParsedTransaction(txSignature, { commitment: "confirmed" });
  if (!tx) {
    return { ok: false as const, error: "Transaction not found" };
  }

  const solTransfer = tx.transaction.message.instructions.find((inst) => {
    const parsed = "parsed" in inst ? inst.parsed : null;
    if (!parsed || parsed.type !== "transfer") {
      return false;
    }

    const info = parsed.info as { destination?: string; source?: string };
    return info.destination === projectWallet && info.source === walletAddress;
  });

  if (!solTransfer) {
    return { ok: false as const, error: "SOL payment to project wallet not found" };
  }

  return { ok: true as const };
}

export function getProjectWalletPublicKey(): PublicKey {
  return new PublicKey(getProjectWallet());
}
