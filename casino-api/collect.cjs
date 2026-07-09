// Create signed collect transaction (treasury -> user) — adapted from xapes, slots only
const { PublicKey, Transaction, Keypair } = require("@solana/web3.js");
const {
  getAssociatedTokenAddress,
  createTransferInstruction,
  createAssociatedTokenAccountInstruction,
} = require("@solana/spl-token");
const { getSql, setCors, json } = require("./slots-helpers.cjs");
const { isValidWalletAddress } = require("./wallet-utils.cjs");
const { isCasinoPaused, DB_DECIMALS } = require("./game-logic.cjs");
const { acquireCollectLock, releaseCollectLock } = require("./collect-lock.cjs");
const { reconcileSubmittedCollects } = require("./collect-reconcile.cjs");
const {
  getTokenAccountWithFallback,
  getLatestBlockhashWithFallback,
  isRetryableRpcError,
  isAccountNotFoundError,
} = require("./rpc-candidates.cjs");

const TREASURY_WALLET = process.env.TREASURY_WALLET;

function getTokenMintAndDecimals(token) {
  const isBux = token === "bux";
  return {
    mint: isBux ? process.env.BUX_TOKEN_MINT : process.env.KNUKL_TOKEN_MINT,
    decimals: parseInt(isBux ? process.env.BUX_TOKEN_DECIMALS || "9" : process.env.KNUKL_TOKEN_DECIMALS || "8", 10),
  };
}
const MAX_WIN_AMOUNT = 10000000;
const rateLimitMap = new Map();

function checkRateLimit(walletAddress) {
  const now = Date.now();
  const requests = rateLimitMap.get(walletAddress) || [];
  const recent = requests.filter((t) => now - t < 60000);
  if (recent.length >= 10) return false;
  recent.push(now);
  rateLimitMap.set(walletAddress, recent);
  if (rateLimitMap.size > 1000) rateLimitMap.delete(rateLimitMap.keys().next().value);
  return true;
}

async function handler(req, res) {
  setCors(res, req.headers.origin);
  if (req.method === "OPTIONS") return res.end();
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
  if (isCasinoPaused()) {
    return json(res, 503, { error: "Casino withdrawals are temporarily paused" });
  }

  try {
    let { userWallet, amount: amountRaw, gameType = "slots" } = req.body;
    let token = (req.body.token || req.body.tokenUsed || "bux").toString().toLowerCase();
    if (token !== "bux") {
      return json(res, 400, { error: "Only BUX token is supported" });
    }
    let amount = amountRaw != null ? Number(amountRaw) : NaN;
    const gameTypeNorm = (gameType || "slots").toLowerCase();
    if (gameTypeNorm !== "slots" && gameTypeNorm !== "coinflip" && gameTypeNorm !== "roulette") {
      return json(res, 400, { error: "gameType must be slots, coinflip, or roulette" });
    }
    if (!userWallet || !Number.isFinite(amount) || amount <= 0) {
      return json(res, 400, { error: "Invalid request: userWallet and positive amount required" });
    }
    if (!isValidWalletAddress(userWallet)) {
      return json(res, 400, { error: "Invalid wallet address format" });
    }
    if (amount > MAX_WIN_AMOUNT) {
      return json(res, 400, { error: `Win amount exceeds maximum limit of ${MAX_WIN_AMOUNT.toLocaleString()}` });
    }
    if (!checkRateLimit(userWallet)) {
      return json(res, 429, { error: "Too many requests. Please wait before trying again." });
    }

    const sql = getSql();
    if (sql) {
      const reconciled = await reconcileSubmittedCollects(sql, userWallet, gameTypeNorm, token);
      if (reconciled.reconciled) {
        return json(res, 200, {
          reconciled: true,
          message: "Your previous collect has been finalized. Refresh the page.",
          signature: reconciled.signature,
          amount: reconciled.amount,
        });
      }

      const dbDecimals = DB_DECIMALS;
      let playerData, dbUnclaimed;
      if (gameTypeNorm === "coinflip") {
        const rows = await sql`SELECT unclaimed_rewards FROM coinflip_players WHERE wallet_address = ${userWallet} AND token_used = ${token}`;
        playerData = rows[0];
        dbUnclaimed = playerData ? Number(playerData.unclaimed_rewards || 0) / Math.pow(10, dbDecimals) : 0;
      } else if (gameTypeNorm === "roulette") {
        const rows = await sql`SELECT unclaimed_rewards, chips_balance, cost_per_chip FROM roulette_players WHERE wallet_address = ${userWallet} AND token_used = ${token}`;
        playerData = rows[0];
        if (!playerData) {
          dbUnclaimed = 0;
        } else {
          const unclaimedPart = Number(playerData.unclaimed_rewards || 0) / Math.pow(10, dbDecimals);
          const chipPart = (playerData.chips_balance || 0) * (playerData.cost_per_chip || 100);
          dbUnclaimed = unclaimedPart + chipPart;
        }
      } else {
        const rows = await sql`SELECT unclaimed_rewards FROM slots_players WHERE wallet_address = ${userWallet} AND token_used = ${token}`;
        playerData = rows[0];
        dbUnclaimed = playerData ? Number(playerData.unclaimed_rewards || 0) / Math.pow(10, dbDecimals) : 0;
      }
      if (dbUnclaimed <= 0) {
        return json(res, 400, { error: "No unclaimed rewards available", actualAmount: 0 });
      }
      if (Math.abs(dbUnclaimed - amount) > 0.000001) amount = dbUnclaimed;
    }

    const lock = await acquireCollectLock(userWallet, gameTypeNorm, token, amount);
    if (!lock.ok) {
      if (sql) {
        const reconciled = await reconcileSubmittedCollects(sql, userWallet, gameTypeNorm, token);
        if (reconciled.reconciled) {
          return json(res, 200, {
            reconciled: true,
            message: "Your previous collect has been finalized. Refresh the page.",
            signature: reconciled.signature,
            amount: reconciled.amount,
          });
        }
      }
      return json(res, 409, { error: lock.error, pendingAmount: lock.pendingAmount });
    }

    try {
    const { mint: TOKEN_MINT, decimals: TOKEN_DECIMALS } = getTokenMintAndDecimals(token);
    if (!TOKEN_MINT) {
      await releaseCollectLock(userWallet, gameTypeNorm, token);
      return json(res, 500, { error: "Token not configured", message: `Missing ${token === "bux" ? "BUX_TOKEN_MINT" : "KNUKL_TOKEN_MINT"} in env` });
    }

    const treasuryPrivateKey = process.env.TREASURY_PRIVATE_KEY;
    if (!treasuryPrivateKey) {
      await releaseCollectLock(userWallet, gameTypeNorm, token);
      return json(res, 500, { error: "Server configuration error", message: "TREASURY_PRIVATE_KEY not set" });
    }
    if (!TREASURY_WALLET) {
      await releaseCollectLock(userWallet, gameTypeNorm, token);
      return json(res, 500, { error: "Server configuration error", message: "TREASURY_WALLET not set in .env" });
    }

    let treasuryKeypair;
    try {
      if (treasuryPrivateKey.startsWith("[")) {
        const arr = JSON.parse(treasuryPrivateKey);
        if (!Array.isArray(arr) || arr.length !== 64) throw new Error("Invalid key array");
        treasuryKeypair = Keypair.fromSecretKey(Uint8Array.from(arr));
      } else {
        const bs58 = require("bs58").default || require("bs58");
        const decoded = bs58.decode(treasuryPrivateKey);
        if (decoded.length !== 64) throw new Error("Invalid key length");
        treasuryKeypair = Keypair.fromSecretKey(decoded);
      }
    } catch (e) {
      await releaseCollectLock(userWallet, gameTypeNorm, token);
      return json(res, 500, { error: "Invalid treasury key configuration", message: e.message });
    }

    if (treasuryKeypair.publicKey.toString() !== TREASURY_WALLET) {
      await releaseCollectLock(userWallet, gameTypeNorm, token);
      return json(res, 500, { error: "Treasury key mismatch" });
    }

    const tokenMint = new PublicKey(TOKEN_MINT);
    const decimals = TOKEN_DECIMALS;
    const userPublicKey = new PublicKey(userWallet);
    const treasuryPublicKey = new PublicKey(TREASURY_WALLET);

    const userTokenAccount = await getAssociatedTokenAddress(tokenMint, userPublicKey);
    const treasuryTokenAccount = await getAssociatedTokenAddress(tokenMint, treasuryPublicKey);

    const transferAmountRaw = amount * Math.pow(10, decimals);
    if (!isFinite(transferAmountRaw) || transferAmountRaw <= 0) {
      await releaseCollectLock(userWallet, gameTypeNorm, token);
      return json(res, 400, { error: "Invalid transfer amount" });
    }
    const transferAmount = BigInt(Math.floor(transferAmountRaw));

    let userAccountExists = false;
    try {
      await getTokenAccountWithFallback(userTokenAccount);
      userAccountExists = true;
    } catch (userAccountError) {
      if (!isAccountNotFoundError(userAccountError) && !isRetryableRpcError(userAccountError)) {
        await releaseCollectLock(userWallet, gameTypeNorm, token);
        return json(res, 500, {
          error: "Failed to verify user token account",
          message: userAccountError.message || String(userAccountError),
        });
      }
    }

    try {
      const treasuryAccountInfo = await getTokenAccountWithFallback(treasuryTokenAccount);
      const treasuryBalance = Number(treasuryAccountInfo.amount);
      if (treasuryBalance < Number(transferAmount)) {
        await releaseCollectLock(userWallet, gameTypeNorm, token);
        return json(res, 503, {
          error: "Insufficient treasury balance",
          message: `Available: ${(treasuryBalance / Math.pow(10, decimals)).toFixed(2)}, Required: ${amount}`,
          availableBalance: treasuryBalance / Math.pow(10, decimals),
        });
      }
    } catch (accountError) {
      const msg = accountError.message || "";
      if (isAccountNotFoundError(accountError)) {
        await releaseCollectLock(userWallet, gameTypeNorm, token);
        return json(res, 503, {
          error: "Treasury token account not found",
          message: "Make a purchase first to create the treasury token account.",
          treasuryAccount: treasuryTokenAccount.toString(),
        });
      }
      if (isRetryableRpcError(accountError)) {
        await releaseCollectLock(userWallet, gameTypeNorm, token);
        return json(res, 503, {
          error: "RPC temporarily unavailable",
          message: "Solana RPC is busy. Please try collecting again in a few seconds.",
        });
      }
      await releaseCollectLock(userWallet, gameTypeNorm, token);
      return json(res, 500, { error: "Failed to verify treasury balance", message: msg });
    }

    const transaction = new Transaction();
    if (!userAccountExists) {
      transaction.add(
        createAssociatedTokenAccountInstruction(
          treasuryPublicKey,
          userTokenAccount,
          userPublicKey,
          tokenMint
        )
      );
    }
    transaction.add(
      createTransferInstruction(
        treasuryTokenAccount,
        userTokenAccount,
        treasuryPublicKey,
        transferAmount
      )
    );

    let blockhash;
    try {
      ({ blockhash } = await getLatestBlockhashWithFallback());
    } catch (blockhashError) {
      await releaseCollectLock(userWallet, gameTypeNorm, token);
      if (isRetryableRpcError(blockhashError)) {
        return json(res, 503, {
          error: "RPC temporarily unavailable",
          message: "Solana RPC is busy. Please try collecting again in a few seconds.",
        });
      }
      throw blockhashError;
    }
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = treasuryPublicKey;
    transaction.sign(treasuryKeypair);

    const serialized = transaction.serialize({ requireAllSignatures: false, verifySignatures: false });

    return json(res, 200, {
      transaction: serialized.toString("base64"),
      actualAmount: amount,
    });
    } catch (collectErr) {
      await releaseCollectLock(userWallet, gameTypeNorm, token);
      throw collectErr;
    }
  } catch (err) {
    console.error("Collect error:", err);
    return json(res, 500, { error: "Failed to create collect transaction", message: err.message });
  }
}

module.exports = { handler };
