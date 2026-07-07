import { Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import bs58 from "bs58";
import { getLiquidityPrivateKey, getLiquidityWallet } from "@/lib/cashout/config";
import { withServerConnection } from "@/lib/solana/server-rpc";

function loadKeypairFromSecret(secret: string): Keypair {
  if (secret.startsWith("[")) {
    const bytes = JSON.parse(secret) as number[];
    if (!Array.isArray(bytes) || bytes.length !== 64) {
      throw new Error("Invalid liquidity private key array");
    }
    return Keypair.fromSecretKey(Uint8Array.from(bytes));
  }

  const decoded = bs58.decode(secret);
  if (decoded.length !== 64) {
    throw new Error("Invalid liquidity private key length");
  }
  return Keypair.fromSecretKey(decoded);
}

export async function sendLiquiditySolTransfer(params: {
  recipientWallet: string;
  lamports: bigint;
}): Promise<string> {
  const wallet = getLiquidityWallet();
  const privateKey = getLiquidityPrivateKey();
  if (!wallet || !privateKey) {
    throw new Error("Liquidity wallet is not configured");
  }

  if (params.lamports <= BigInt(0)) {
    throw new Error("Invalid SOL payout amount");
  }

  const keypair = loadKeypairFromSecret(privateKey);
  if (keypair.publicKey.toBase58() !== wallet) {
    throw new Error("Liquidity private key does not match liquidity wallet");
  }

  const recipient = new PublicKey(params.recipientWallet);
  const lamportsNum = Number(params.lamports);
  if (!Number.isSafeInteger(lamportsNum) || lamportsNum <= 0) {
    throw new Error("SOL payout amount is too large");
  }

  return withServerConnection(async (connection) => {
    const balance = await connection.getBalance(keypair.publicKey);
    const reserve = 5_000_000; // keep ~0.005 SOL for rent / fees
    if (balance < lamportsNum + reserve) {
      throw new Error("Liquidity pool has insufficient SOL for this cashout");
    }

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: recipient,
        lamports: lamportsNum,
      }),
    );

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = keypair.publicKey;
    transaction.sign(keypair);

    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });

    const confirmation = await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      "confirmed",
    );

    if (confirmation.value.err) {
      throw new Error("SOL payout failed on-chain");
    }

    return signature;
  });
}
