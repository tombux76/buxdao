// Verify treasury -> user collect payout on chain before clearing unclaimed.
const { PublicKey } = require("@solana/web3.js");
const { getAssociatedTokenAddress } = require("@solana/spl-token");
const { getParsedTransactionWithFallback } = require("./rpc-candidates.cjs");

function getTokenDecimals() {
  return parseInt(process.env.BUX_TOKEN_DECIMALS || "9", 10);
}

async function verifyCollectPayout({ signature, userWallet, expectedAmount }) {
  const treasuryWallet = process.env.TREASURY_WALLET;
  const mint = process.env.BUX_TOKEN_MINT;
  if (!treasuryWallet || !mint) {
    throw new Error("Treasury or token mint not configured");
  }

  const decimals = getTokenDecimals();
  const minAmountRaw = BigInt(Math.floor(Number(expectedAmount) * Math.pow(10, decimals) * 0.999));

  const parsed = await getParsedTransactionWithFallback(signature);

  if (parsed.meta?.err) throw new Error("Collect transaction failed on chain");

  const pre = parsed.meta?.preTokenBalances || [];
  const post = parsed.meta?.postTokenBalances || [];

  let userCredit = 0n;
  let treasuryDebit = 0n;

  for (const postBal of post) {
    if (postBal.mint !== mint) continue;
    const preBal = pre.find((p) => p.accountIndex === postBal.accountIndex);
    const preAmt = BigInt(preBal?.uiTokenAmount?.amount || "0");
    const postAmt = BigInt(postBal.uiTokenAmount?.amount || "0");
    const delta = postAmt - preAmt;
    if (postBal.owner === userWallet && delta > 0n) userCredit += delta;
    if (postBal.owner === treasuryWallet && delta < 0n) treasuryDebit += -delta;
  }

  if (userCredit < minAmountRaw) {
    throw new Error("Collect transaction did not credit the expected amount to the user");
  }
  if (treasuryDebit < minAmountRaw) {
    throw new Error("Collect transaction did not debit the treasury");
  }

  // Optional: verify user ATA received funds
  try {
    const userPk = new PublicKey(userWallet);
    const mintPk = new PublicKey(mint);
    const userAta = await getAssociatedTokenAddress(mintPk, userPk);
    const accountKeys = parsed.transaction?.message?.accountKeys || [];
    const userAtaStr = userAta.toString();
    const idx = accountKeys.findIndex((k) => (typeof k === "string" ? k : k.pubkey?.toString?.() || k.toString()) === userAtaStr);
    if (idx >= 0) {
      const postBal = post.find((b) => b.accountIndex === idx);
      const preBal = pre.find((b) => b.accountIndex === idx);
      if (postBal && preBal) {
        const delta = BigInt(postBal.uiTokenAmount?.amount || "0") - BigInt(preBal.uiTokenAmount?.amount || "0");
        if (delta < minAmountRaw) throw new Error("User token account credit mismatch");
      }
    }
  } catch (e) {
    if (e.message.includes("mismatch") || e.message.includes("credit")) throw e;
  }

  return true;
}

module.exports = { verifyCollectPayout };
