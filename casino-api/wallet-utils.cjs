/** Base58 Solana wallet check — avoids @solana/web3.js for simple validation. */
function isValidWalletAddress(address) {
  return typeof address === "string" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address.trim());
}

module.exports = { isValidWalletAddress };
