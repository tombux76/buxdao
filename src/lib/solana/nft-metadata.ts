import { PublicKey } from "@solana/web3.js";
import { jsonRpc, withRpcFallback } from "@/lib/solana/bux-token-accounts";

const METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

export type OnChainNftMetadata = {
  mint: string;
  name: string;
  uri: string;
  /** Verified collection mint, or null when unset / unverified. */
  collection: string | null;
};

function metadataPda(mint: string): string {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), METADATA_PROGRAM_ID.toBuffer(), new PublicKey(mint).toBuffer()],
    METADATA_PROGRAM_ID,
  )[0].toBase58();
}

function readString(buf: Buffer, offset: number): [string, number] {
  const len = buf.readUInt32LE(offset);
  const value = buf
    .subarray(offset + 4, offset + 4 + len)
    .toString("utf8")
    .replace(/\0/g, "")
    .trim();
  return [value, offset + 4 + len];
}

/** Borsh layout of Token Metadata `Metadata` up to the `collection` field. */
function parseMetadata(mint: string, buf: Buffer): OnChainNftMetadata | null {
  try {
    const [name, afterName] = readString(buf, 1 + 32 + 32);
    const [, afterSymbol] = readString(buf, afterName);
    const [uri, afterUri] = readString(buf, afterSymbol);
    let o = afterUri;
    o += 2;
    if (buf[o++] === 1) {
      o += 4 + buf.readUInt32LE(o) * 34;
    }
    o += 2;
    if (buf[o++] === 1) {
      o += 1;
    }
    if (buf[o++] === 1) {
      o += 1;
    }
    let collection: string | null = null;
    if (buf[o++] === 1) {
      const verified = buf[o] === 1;
      const key = new PublicKey(buf.subarray(o + 1, o + 33)).toBase58();
      collection = verified ? key : null;
    }
    return { mint, name: name || "Unknown", uri, collection };
  } catch {
    return null;
  }
}

/** Live on-chain metadata via getMultipleAccounts — no Helius DAS required. */
export async function fetchOnChainNftMetadata(
  mints: string[],
): Promise<Map<string, OnChainNftMetadata>> {
  const out = new Map<string, OnChainNftMetadata>();
  const unique = [...new Set(mints)];
  const chunkSize = 100;

  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const pdas = chunk.map(metadataPda);
    const result = await withRpcFallback((url) =>
      jsonRpc<{ value: ({ data: [string, string] } | null)[] }>(url, "getMultipleAccounts", [
        pdas,
        { encoding: "base64", commitment: "confirmed" },
      ]),
    );
    result.value.forEach((account, idx) => {
      if (!account?.data?.[0]) {
        return;
      }
      const parsed = parseMetadata(chunk[idx]!, Buffer.from(account.data[0], "base64"));
      if (parsed) {
        out.set(parsed.mint, parsed);
      }
    });
  }

  return out;
}
