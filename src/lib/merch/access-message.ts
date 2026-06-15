const ACCESS_TTL_MS = 5 * 60 * 1000;

export function buildMerchAccessMessage(walletAddress: string, issuedAtMs = Date.now()): string {
  const expiresAtMs = issuedAtMs + ACCESS_TTL_MS;
  return [
    "View BUXDAO merch orders.",
    "",
    `Wallet: ${walletAddress}`,
    `Issued: ${issuedAtMs}`,
    `Expires: ${expiresAtMs}`,
  ].join("\n");
}

export function signatureBytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}
