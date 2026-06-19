import {
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAccount,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import bs58 from "bs58";

function loadKeypairFromSecret(secret: string): Keypair {
  if (secret.startsWith("[")) {
    const bytes = JSON.parse(secret) as number[];
    if (!Array.isArray(bytes) || bytes.length !== 64) {
      throw new Error("Invalid treasury private key array");
    }
    return Keypair.fromSecretKey(Uint8Array.from(bytes));
  }

  const decoded = bs58.decode(secret);
  if (decoded.length !== 64) {
    throw new Error("Invalid treasury private key length");
  }
  return Keypair.fromSecretKey(decoded);
}

function getRpcUrl(): string {
  return (
    process.env.SOLANA_RPC_URL ||
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
    (process.env.HELIUS_API_KEY
      ? `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(process.env.HELIUS_API_KEY)}`
      : "https://api.mainnet-beta.solana.com")
  );
}

async function sendBuxTransferFromWallet(params: {
  senderWallet: string;
  senderPrivateKey: string;
  recipientWallet: string;
  amountBux: bigint;
}): Promise<string> {
  const mintAddress = process.env.BUX_TOKEN_MINT?.trim();
  if (!mintAddress) {
    throw new Error("BUX token is not configured");
  }

  const decimals = Number.parseInt(process.env.BUX_TOKEN_DECIMALS ?? "9", 10);
  const treasuryKeypair = loadKeypairFromSecret(params.senderPrivateKey);
  if (treasuryKeypair.publicKey.toBase58() !== params.senderWallet) {
    throw new Error("Sender private key does not match sender wallet address");
  }

  const connection = new Connection(getRpcUrl(), "confirmed");
  const mint = new PublicKey(mintAddress);
  const recipient = new PublicKey(params.recipientWallet);
  const treasuryPublicKey = treasuryKeypair.publicKey;

  const recipientAta = await getAssociatedTokenAddress(mint, recipient);
  const treasuryAta = await getAssociatedTokenAddress(mint, treasuryPublicKey);

  const rawAmount = params.amountBux * BigInt(10 ** decimals);
  if (rawAmount <= BigInt(0)) {
    throw new Error("Invalid transfer amount");
  }

  const treasuryAccount = await getAccount(connection, treasuryAta);
  if (treasuryAccount.amount < rawAmount) {
    throw new Error("Treasury has insufficient $BUX for this claim");
  }

  const transaction = new Transaction();

  try {
    await getAccount(connection, recipientAta);
  } catch {
    transaction.add(
      createAssociatedTokenAccountInstruction(
        treasuryPublicKey,
        recipientAta,
        recipient,
        mint,
      ),
    );
  }

  transaction.add(
    createTransferInstruction(treasuryAta, recipientAta, treasuryPublicKey, rawAmount),
  );

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = treasuryPublicKey;
  transaction.sign(treasuryKeypair);

  const signature = await connection.sendRawTransaction(transaction.serialize(), {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });

  const confirmation = await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    "confirmed",
  );

  if (confirmation.value.err) {
    throw new Error("On-chain transfer failed");
  }

  return signature;
}

/** Holder Hub claim payouts — amount is raw token units (9 decimals). */
export async function sendTreasuryBuxRawTransfer(params: {
  recipientWallet: string;
  amountRaw: bigint;
}): Promise<string> {
  const senderWallet = process.env.TREASURY_WALLET?.trim();
  const senderPrivateKey = process.env.TREASURY_PRIVATE_KEY?.trim();
  if (!senderWallet || !senderPrivateKey) {
    throw new Error("Treasury is not configured");
  }

  const mintAddress = process.env.BUX_TOKEN_MINT?.trim();
  if (!mintAddress) {
    throw new Error("BUX token is not configured");
  }

  const treasuryKeypair = loadKeypairFromSecret(senderPrivateKey);
  if (treasuryKeypair.publicKey.toBase58() !== senderWallet) {
    throw new Error("Treasury key mismatch");
  }

  const connection = new Connection(getRpcUrl(), "confirmed");
  const mint = new PublicKey(mintAddress);
  const recipient = new PublicKey(params.recipientWallet);
  const treasuryPublicKey = treasuryKeypair.publicKey;

  const recipientAta = await getAssociatedTokenAddress(mint, recipient);
  const treasuryAta = await getAssociatedTokenAddress(mint, treasuryPublicKey);

  if (params.amountRaw <= BigInt(0)) {
    throw new Error("Invalid transfer amount");
  }

  const treasuryAccount = await getAccount(connection, treasuryAta);
  if (treasuryAccount.amount < params.amountRaw) {
    throw new Error("Treasury has insufficient $BUX for this claim");
  }

  const transaction = new Transaction();

  try {
    await getAccount(connection, recipientAta);
  } catch {
    transaction.add(
      createAssociatedTokenAccountInstruction(
        treasuryPublicKey,
        recipientAta,
        recipient,
        mint,
      ),
    );
  }

  transaction.add(
    createTransferInstruction(treasuryAta, recipientAta, treasuryPublicKey, params.amountRaw),
  );

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = treasuryPublicKey;
  transaction.sign(treasuryKeypair);

  const signature = await connection.sendRawTransaction(transaction.serialize(), {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });

  const confirmation = await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    "confirmed",
  );

  if (confirmation.value.err) {
    throw new Error("On-chain $BUX transfer failed");
  }

  return signature;
}

/** Casino collect / game payouts */
export async function sendTreasuryBuxTransfer(params: {
  recipientWallet: string;
  amountBux: bigint;
}): Promise<string> {
  const senderWallet = process.env.TREASURY_WALLET?.trim();
  const senderPrivateKey = process.env.TREASURY_PRIVATE_KEY?.trim();
  if (!senderWallet || !senderPrivateKey) {
    throw new Error("Treasury is not configured");
  }

  return sendBuxTransferFromWallet({
    senderWallet,
    senderPrivateKey,
    recipientWallet: params.recipientWallet,
    amountBux: params.amountBux,
  });
}
