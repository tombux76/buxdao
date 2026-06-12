// Create signed collect transaction (treasury -> user) — adapted from xapes, slots only
const { Connection, PublicKey, Transaction, Keypair } = require("@solana/web3.js");
const {
  getAssociatedTokenAddress,
  createTransferInstruction,
  getAccount,
  createAssociatedTokenAccountInstruction,
} = require("@solana/spl-token");
const { sql, setCors, json } = require("./slots-helpers.cjs");

const TREASURY_WALLET = process.env.TREASURY_WALLET;

function getTokenMintAndDecimals(token) {
  const isBux = token === "bux";
  return {
    mint: isBux ? process.env.BUX_TOKEN_MINT : process.env.KNUKL_TOKEN_MINT,
    decimals: parseInt(isBux ? process.env.BUX_TOKEN_DECIMALS || "9" : process.env.KNUKL_TOKEN_DECIMALS || "8", 10),
  };
}
const HELIUS_RPC = process.env.HELIUS_RPC || "https://mainnet.helius-rpc.com";
const RPC_URL =
  process.env.SLOTS_RPC_URL ||
  (process.env.HELIUS_API_KEY ? HELIUS_RPC + "/?api-key=" + encodeURIComponent(process.env.HELIUS_API_KEY) : HELIUS_RPC + "/");

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
    try {
      new PublicKey(userWallet);
    } catch (_) {
      return json(res, 400, { error: "Invalid wallet address format" });
    }
    if (amount > MAX_WIN_AMOUNT) {
      return json(res, 400, { error: `Win amount exceeds maximum limit of ${MAX_WIN_AMOUNT.toLocaleString()}` });
    }
    if (!checkRateLimit(userWallet)) {
      return json(res, 429, { error: "Too many requests. Please wait before trying again." });
    }

    if (sql) {
      const dbDecimals = 6;
      let playerData, dbUnclaimed;
      if (gameTypeNorm === "coinflip") {
        const rows = await sql`SELECT unclaimed_rewards FROM coinflip_players WHERE wallet_address = ${userWallet} AND token_used = ${token}`;
        playerData = rows[0];
        dbUnclaimed = playerData ? Number(playerData.unclaimed_rewards || 0) / Math.pow(10, dbDecimals) : 0;
      } else if (gameTypeNorm === "roulette") {
        const rows = await sql`SELECT unclaimed_rewards FROM roulette_players WHERE wallet_address = ${userWallet} AND token_used = ${token}`;
        playerData = rows[0];
        dbUnclaimed = playerData ? Number(playerData.unclaimed_rewards || 0) / Math.pow(10, dbDecimals) : 0;
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

    const { mint: TOKEN_MINT, decimals: TOKEN_DECIMALS } = getTokenMintAndDecimals(token);
    if (!TOKEN_MINT) {
      return json(res, 500, { error: "Token not configured", message: `Missing ${token === "bux" ? "BUX_TOKEN_MINT" : "KNUKL_TOKEN_MINT"} in env` });
    }

    const treasuryPrivateKey = process.env.TREASURY_PRIVATE_KEY;
    if (!treasuryPrivateKey) {
      return json(res, 500, { error: "Server configuration error", message: "TREASURY_PRIVATE_KEY not set" });
    }
    if (!TREASURY_WALLET) {
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
      return json(res, 500, { error: "Invalid treasury key configuration", message: e.message });
    }

    if (treasuryKeypair.publicKey.toString() !== TREASURY_WALLET) {
      return json(res, 500, { error: "Treasury key mismatch" });
    }

    const connection = new Connection(RPC_URL, "confirmed");
    const tokenMint = new PublicKey(TOKEN_MINT);
    const decimals = TOKEN_DECIMALS;
    const userPublicKey = new PublicKey(userWallet);
    const treasuryPublicKey = new PublicKey(TREASURY_WALLET);

    const userTokenAccount = await getAssociatedTokenAddress(tokenMint, userPublicKey);
    const treasuryTokenAccount = await getAssociatedTokenAddress(tokenMint, treasuryPublicKey);

    const transferAmountRaw = amount * Math.pow(10, decimals);
    if (!isFinite(transferAmountRaw) || transferAmountRaw <= 0) {
      return json(res, 400, { error: "Invalid transfer amount" });
    }
    const transferAmount = BigInt(Math.floor(transferAmountRaw));

    let userAccountExists = false;
    try {
      await getAccount(connection, userTokenAccount);
      userAccountExists = true;
    } catch (_) {}

    try {
      const treasuryAccountInfo = await getAccount(connection, treasuryTokenAccount);
      const treasuryBalance = Number(treasuryAccountInfo.amount);
      if (treasuryBalance < Number(transferAmount)) {
        return json(res, 503, {
          error: "Insufficient treasury balance",
          message: `Available: ${(treasuryBalance / Math.pow(10, decimals)).toFixed(2)}, Required: ${amount}`,
          availableBalance: treasuryBalance / Math.pow(10, decimals),
        });
      }
    } catch (accountError) {
      const msg = accountError.message || "";
      if (msg.includes("could not find account") || msg.includes("not found")) {
        return json(res, 503, {
          error: "Treasury token account not found",
          message: "Make a purchase first to create the treasury token account.",
          treasuryAccount: treasuryTokenAccount.toString(),
        });
      }
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

    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = treasuryPublicKey;
    transaction.sign(treasuryKeypair);

    const serialized = transaction.serialize({ requireAllSignatures: false, verifySignatures: false });

    return json(res, 200, {
      transaction: serialized.toString("base64"),
      actualAmount: amount,
    });
  } catch (err) {
    console.error("Collect error:", err);
    return json(res, 500, { error: "Failed to create collect transaction", message: err.message });
  }
}

module.exports = { handler };
