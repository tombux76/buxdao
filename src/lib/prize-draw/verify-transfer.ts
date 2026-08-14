import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { EMPIRE_TOKEN_MINT, PRIZE_WALLET } from "@/lib/prize-draw/config";
import { getParsedTransactionWhenReady } from "@/lib/solana/server-rpc";

type ParsedSplInstruction = {
  type?: string;
  info?: Record<string, unknown>;
};

function accountKeyToBase58(key: unknown): string {
  if (typeof key === "string") {
    return key;
  }
  if (key && typeof key === "object") {
    const record = key as { pubkey?: unknown; toBase58?: () => string };
    if (typeof record.toBase58 === "function") {
      return record.toBase58();
    }
    const pubkey = record.pubkey;
    if (typeof pubkey === "string") {
      return pubkey;
    }
    if (
      pubkey &&
      typeof pubkey === "object" &&
      typeof (pubkey as { toBase58?: () => string }).toBase58 === "function"
    ) {
      return (pubkey as { toBase58: () => string }).toBase58();
    }
  }
  return String(key);
}

function parseAmountRaw(info: Record<string, unknown>): bigint | null {
  const tokenAmount = info.tokenAmount as { amount?: string } | undefined;
  if (tokenAmount?.amount) {
    return BigInt(tokenAmount.amount);
  }
  const amount = info.amount;
  if (typeof amount === "string" || typeof amount === "number") {
    return BigInt(amount);
  }
  return null;
}

function instructionMatchesTransfer(params: {
  parsed: ParsedSplInstruction;
  destinationAta: string;
  mint: string;
  amountRaw: bigint;
}): boolean {
  const { parsed, destinationAta, mint, amountRaw } = params;
  if (!parsed.type || !parsed.info) {
    return false;
  }

  const type = parsed.type;
  if (type !== "transfer" && type !== "transferChecked") {
    return false;
  }

  const info = parsed.info;
  const authority = String(info.authority ?? info.owner ?? "");
  const destination = String(info.destination ?? "");
  const ixMint = String(info.mint ?? mint);

  const ixAmountRaw = parseAmountRaw(info);
  if (ixAmountRaw === null || ixAmountRaw !== amountRaw) {
    return false;
  }

  return authority === PRIZE_WALLET && destination === destinationAta && ixMint === mint;
}

/** Verify an EMPIRE transfer from the prize wallet to the winner's ATA landed on-chain. */
export async function verifyEmpirePrizeTransfer(params: {
  signature: string;
  recipientWallet: string;
  amountRaw: bigint;
}): Promise<void> {
  const mint = EMPIRE_TOKEN_MINT;
  const mintPk = new PublicKey(mint);
  const destinationAta = (
    await getAssociatedTokenAddress(mintPk, new PublicKey(params.recipientWallet))
  ).toBase58();

  // Poll across RPC candidates — confirm often runs before the tx is indexed,
  // and Helius keys frequently 429; public RPC is a fallback in the candidate list.
  const tx = await getParsedTransactionWhenReady(params.signature, {
    maxWaitMs: 35_000,
    pollMs: 1_500,
  });

  if (!tx?.meta || tx.meta.err) {
    throw new Error("EMPIRE transfer not found or failed on-chain");
  }

  const feePayerAddress = accountKeyToBase58(tx.transaction.message.accountKeys[0]);

  if (feePayerAddress !== PRIZE_WALLET) {
    throw new Error("Prize transfer must be signed by the prize wallet");
  }

  const checkParams = {
    parsed: {} as ParsedSplInstruction,
    destinationAta,
    mint,
    amountRaw: params.amountRaw,
  };

  const allInstructions = [
    ...tx.transaction.message.instructions,
    ...(tx.meta.innerInstructions ?? []).flatMap((block) => block.instructions),
  ];

  for (const ix of allInstructions) {
    if (!("parsed" in ix) || !ix.parsed) {
      continue;
    }
    checkParams.parsed = ix.parsed as ParsedSplInstruction;
    if (instructionMatchesTransfer(checkParams)) {
      return;
    }
  }

  // Fallback: token balance delta on the winner's ATA
  const pre = tx.meta.preTokenBalances ?? [];
  const post = tx.meta.postTokenBalances ?? [];
  for (const postBal of post) {
    if (postBal.mint !== mint) {
      continue;
    }
    const preBal = pre.find(
      (entry) => entry.accountIndex === postBal.accountIndex && entry.mint === mint,
    );
    const preAmount = BigInt(preBal?.uiTokenAmount?.amount ?? "0");
    const postAmount = BigInt(postBal.uiTokenAmount?.amount ?? "0");
    if (postAmount - preAmount === params.amountRaw) {
      return;
    }
  }

  throw new Error("Could not verify the EMPIRE prize transfer to the winner's wallet");
}

export function isValidTxSignature(signature: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{64,120}$/.test(signature);
}
