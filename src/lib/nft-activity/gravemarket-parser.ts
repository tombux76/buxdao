import type { NftActivityEventType } from "@/lib/discord/nft-embed";

export const GRAVE_MARKET_PROGRAM = "GRAVENNCLF1daKeBAHCvbD2Pw12xLMY6GGM2e4LChwcd";

const LIST_INSTRUCTIONS = new Set(["CreateListingLegacy"]);
const DELIST_INSTRUCTIONS = new Set(["CancelListingLegacy"]);
const SALE_INSTRUCTIONS = new Set(["ExecuteSaleLegacy", "BuyLegacy", "BuyListingLegacy"]);

type TokenBalance = {
  mint?: string;
};

type GravemarketTx = {
  signature?: string;
  feePayer?: string;
  type?: string;
  instructions?: Array<{ programId?: string }>;
  meta?: {
    logMessages?: string[];
    preTokenBalances?: TokenBalance[];
    postTokenBalances?: TokenBalance[];
  };
};

export type ParsedGravemarketEvent = {
  signature: string;
  eventType: Extract<NftActivityEventType, "list" | "delist" | "sale">;
  mint: string;
  seller: string | null;
};

export function parseGravemarketInstruction(logs: string[] | undefined): string | null {
  for (const line of logs ?? []) {
    const match = line.match(/Program log: Instruction: (\w+)/);
    if (match?.[1]) {
      return match[1];
    }
  }
  return null;
}

function usesGravemarketProgram(tx: GravemarketTx): boolean {
  return (tx.instructions ?? []).some((ix) => ix.programId === GRAVE_MARKET_PROGRAM);
}

function extractNftMint(tx: GravemarketTx): string | null {
  const mints = new Set<string>();
  for (const balance of [...(tx.meta?.preTokenBalances ?? []), ...(tx.meta?.postTokenBalances ?? [])]) {
    if (balance.mint) {
      mints.add(balance.mint);
    }
  }
  if (mints.size === 1) {
    return [...mints][0];
  }
  return null;
}

function mapInstructionToEventType(instruction: string): ParsedGravemarketEvent["eventType"] | null {
  if (LIST_INSTRUCTIONS.has(instruction)) {
    return "list";
  }
  if (DELIST_INSTRUCTIONS.has(instruction)) {
    return "delist";
  }
  if (SALE_INSTRUCTIONS.has(instruction)) {
    return "sale";
  }
  return null;
}

export function parseGravemarketEvents(tx: GravemarketTx): ParsedGravemarketEvent[] {
  if (!usesGravemarketProgram(tx)) {
    return [];
  }

  const signature = tx.signature?.trim();
  const instruction = parseGravemarketInstruction(tx.meta?.logMessages);
  const eventType = instruction ? mapInstructionToEventType(instruction) : null;
  const mint = extractNftMint(tx);

  if (!signature || !eventType || !mint) {
    return [];
  }

  return [
    {
      signature,
      eventType,
      mint,
      seller: tx.feePayer ?? null,
    },
  ];
}
