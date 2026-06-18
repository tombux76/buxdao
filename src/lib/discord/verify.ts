import nacl from "tweetnacl";

export function verifyDiscordSignature(params: {
  body: string;
  signature: string | null;
  timestamp: string | null;
  publicKey: string;
}): boolean {
  const { body, signature, timestamp, publicKey } = params;
  if (!signature || !timestamp || !publicKey) {
    return false;
  }

  try {
    return nacl.sign.detached.verify(
      Buffer.from(timestamp + body),
      Buffer.from(signature, "hex"),
      Buffer.from(publicKey, "hex"),
    );
  } catch {
    return false;
  }
}
