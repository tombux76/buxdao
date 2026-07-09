// Shared Solana RPC URL list + helpers for casino server handlers.
const { Connection } = require("@solana/web3.js");
const { getAccount } = require("@solana/spl-token");

function getRpcCandidates() {
  const urls = [];
  const add = (value) => {
    const trimmed = value?.trim();
    if (trimmed && !urls.includes(trimmed)) {
      urls.push(trimmed);
    }
  };

  add(process.env.SOLANA_RPC_URL);
  add(process.env.NEXT_PUBLIC_SOLANA_RPC_URL);
  add(process.env.SLOTS_RPC_URL);

  if (process.env.HELIUS_API_KEY) {
    add(`https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(process.env.HELIUS_API_KEY)}`);
  }
  if (process.env.HELIUS_API_KEY_2) {
    add(`https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(process.env.HELIUS_API_KEY_2)}`);
  }

  const extras = process.env.HELIUS_API_KEYS?.split(",") ?? [];
  for (const entry of extras) {
    add(entry);
  }

  add("https://api.mainnet-beta.solana.com");
  return urls;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function rpcErrorText(err) {
  const parts = [
    err?.message,
    err?.cause?.message,
    err?.cause?.code,
    String(err),
  ];
  return parts.filter(Boolean).join(" ").toLowerCase();
}

function isRateLimitError(err) {
  const msg = rpcErrorText(err);
  return (
    msg.includes("429") ||
    msg.includes("too many requests") ||
    msg.includes("rate limit") ||
    msg.includes("403") ||
    msg.includes("max usage reached")
  );
}

/** Network / TLS / upstream failures — try the next RPC instead of aborting. */
function isRetryableRpcError(err) {
  if (isRateLimitError(err)) return true;
  const msg = rpcErrorText(err);
  return (
    msg.includes("fetch failed") ||
    msg.includes("ssl") ||
    msg.includes("tls") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("enotfound") ||
    msg.includes("socket hang up") ||
    msg.includes("network") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("504") ||
    msg.includes("bad gateway")
  );
}

function isAccountNotFoundError(err) {
  const msg = (err?.message || String(err)).toLowerCase();
  return msg.includes("could not find account") || msg.includes("not found");
}

async function withRpcFallback(operation, options = {}) {
  const retries = options.retries ?? 2;
  const retryDelayMs = options.retryDelayMs ?? 600;
  const urls = getRpcCandidates();
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    for (const url of urls) {
      try {
        const connection = new Connection(url, "confirmed");
        return await operation(connection, url);
      } catch (err) {
        lastError = err;
        if (isAccountNotFoundError(err)) {
          throw err;
        }
      }
    }
    if (attempt < retries) {
      await sleep(retryDelayMs * (attempt + 1));
    }
  }

  throw lastError || new Error("All RPC endpoints failed");
}

async function getTokenAccountWithFallback(tokenAccount) {
  return withRpcFallback((connection) => getAccount(connection, tokenAccount));
}

async function getLatestBlockhashWithFallback() {
  return withRpcFallback((connection) => connection.getLatestBlockhash("confirmed"));
}

async function getParsedTransactionWithFallback(signature, options = {}) {
  const commitments = options.commitments || ["confirmed", "finalized"];
  const maxWaitMs = options.maxWaitMs ?? 45_000;
  const pollMs = options.pollMs ?? 1500;
  const deadline = Date.now() + maxWaitMs;
  let lastError = null;

  while (Date.now() < deadline) {
    for (const url of getRpcCandidates()) {
      try {
        const connection = new Connection(url, "confirmed");
        for (const commitment of commitments) {
          const parsed = await connection.getParsedTransaction(signature, {
            maxSupportedTransactionVersion: 0,
            commitment,
          });
          if (parsed?.meta) {
            return parsed;
          }
        }
      } catch (err) {
        lastError = err;
      }
    }
    await sleep(pollMs);
  }

  throw lastError || new Error("Transaction not found on chain");
}

async function getSignatureStatusWithFallback(signature, options = {}) {
  const retries = options.retries ?? 5;
  const initialWaitMs = options.initialWaitMs ?? 1000;
  let waitTime = initialWaitMs;
  let lastError = null;

  for (let attempt = 0; attempt < retries; attempt++) {
    for (const url of getRpcCandidates()) {
      try {
        const connection = new Connection(url, "confirmed");
        const status = await connection.getSignatureStatus(signature);
        if (status?.value) {
          return status;
        }
      } catch (err) {
        lastError = err;
        if (!isRetryableRpcError(err)) {
          throw err;
        }
      }
    }
    if (attempt < retries - 1) {
      await sleep(waitTime);
      waitTime = Math.min(Math.floor(waitTime * 1.5), 8000);
    }
  }

  if (lastError && !isRetryableRpcError(lastError)) {
    throw lastError;
  }
  return null;
}

module.exports = {
  getRpcCandidates,
  sleep,
  isRateLimitError,
  isRetryableRpcError,
  isAccountNotFoundError,
  withRpcFallback,
  getTokenAccountWithFallback,
  getLatestBlockhashWithFallback,
  getParsedTransactionWithFallback,
  getSignatureStatusWithFallback,
};
