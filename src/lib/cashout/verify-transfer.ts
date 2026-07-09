import { PublicKey, type ParsedTransactionWithMeta } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { tokenConfig } from "@/content/site";
import { getLiquidityWallet } from "@/lib/cashout/config";
import { withServerConnection } from "@/lib/solana/server-rpc";

type ParsedSplInstruction = {
  type?: string;
  info?: Record<string, unknown>;
};

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

function accountAddressAtIndex(tx: ParsedTransactionWithMeta, accountIndex: number): string | null {
  const key = tx.transaction.message.accountKeys[accountIndex];
  if (!key) {
    return null;
  }
  if (typeof key === "object" && key !== null && "pubkey" in key) {
    return (key as { pubkey: PublicKey }).pubkey.toBase58();
  }
  return String(key);
}

function instructionMatchesTransfer(params: {
  parsed: ParsedSplInstruction;
  fromWallet: string;
  liquidityAta: string;
  mint: string;
  amountRaw: bigint;
}): boolean {
  const { parsed, fromWallet, liquidityAta, mint, amountRaw } = params;
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

  return authority === fromWallet && destination === liquidityAta && ixMint === mint;
}

function verifyBalanceDeltas(params: {
  tx: ParsedTransactionWithMeta;
  mint: string;
  amountRaw: bigint;
  liquidityAta: string;
  fromWallet: string;
  liquidityWallet: string;
}): boolean {
  const pre = params.tx.meta?.preTokenBalances ?? [];
  const post = params.tx.meta?.postTokenBalances ?? [];

  let liquidityCredit = false;
  let sourceDebit = false;

  for (const postBal of post) {
    if (postBal.mint !== params.mint) {
      continue;
    }

    const accountAddress = accountAddressAtIndex(params.tx, postBal.accountIndex);
    if (!accountAddress) {
      continue;
    }

    const owner = postBal.owner ?? "";
    const preBal = pre.find(
      (entry) => entry.accountIndex === postBal.accountIndex && entry.mint === params.mint,
    );
    const preAmount = BigInt(preBal?.uiTokenAmount?.amount ?? "0");
    const postAmount = BigInt(postBal.uiTokenAmount?.amount ?? "0");
    const delta = postAmount - preAmount;

    if (
      (accountAddress === params.liquidityAta || owner === params.liquidityWallet) &&
      delta === params.amountRaw
    ) {
      liquidityCredit = true;
    }
    if (owner === params.fromWallet && delta === -params.amountRaw) {
      sourceDebit = true;
    }
  }

  return liquidityCredit && sourceDebit;
}

export async function verifyBuxTransferToLiquidity(params: {
  signature: string;
  fromWallet: string;
  amountRaw: bigint;
}): Promise<void> {
  const liquidityWallet = getLiquidityWallet();
  const mint = tokenConfig.mint;
  const mintPk = new PublicKey(mint);
  const liquidityAta = (
    await getAssociatedTokenAddress(mintPk, new PublicKey(liquidityWallet))
  ).toBase58();

  await withServerConnection(async (connection) => {
    const tx = await connection.getParsedTransaction(params.signature, {
      maxSupportedTransactionVersion: 0,
      commitment: "finalized",
    });

    if (!tx?.meta || tx.meta.err) {
      throw new Error("$BUX transfer not found or failed on-chain");
    }

    const feePayer = tx.transaction.message.accountKeys[0];
    const feePayerAddress =
      typeof feePayer === "object" && feePayer !== null && "pubkey" in feePayer
        ? (feePayer as { pubkey: PublicKey }).pubkey.toBase58()
        : String(feePayer);

    if (feePayerAddress !== params.fromWallet) {
      throw new Error("$BUX transfer must be signed by your linked payout wallet");
    }

    const checkParams = {
      parsed: {} as ParsedSplInstruction,
      fromWallet: params.fromWallet,
      liquidityAta,
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

    if (
      verifyBalanceDeltas({
        tx,
        mint,
        amountRaw: params.amountRaw,
        liquidityAta,
        fromWallet: params.fromWallet,
        liquidityWallet,
      })
    ) {
      return;
    }

    throw new Error(
      "Could not verify $BUX transfer to the liquidity wallet. Send the exact amount from your linked wallet.",
    );
  });
}
