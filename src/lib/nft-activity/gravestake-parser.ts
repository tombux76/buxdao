import type { NftActivityEventType } from "@/lib/discord/nft-embed";

export const GRAVESTAKE_PROGRAM = "GRv7q7Tff1yEEwvuuBin9xySF35pk7Vc4sVyJLM9wSTK";

const STAKE_INSTRUCTIONS = new Set(["StakeLegacy", "SoftStakeLegacy"]);
const UNSTAKE_INSTRUCTIONS = new Set(["SoftUnstakeLegacy", "UnstakeLegacy"]);
const SOFT_STAKE_INSTRUCTIONS = new Set(["SoftStakeLegacy"]);
const SOFT_UNSTAKE_INSTRUCTIONS = new Set(["SoftUnstakeLegacy"]);

type TokenBalance = {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount?: { decimals?: number; uiAmount?: number | null };
};

type ParsedSplInstruction = {
  type: string;
  info: Record<string, unknown>;
};

type ParsedTx = {
  transaction: {
    message: {
      accountKeys: Array<string | { pubkey?: string }>;
      instructions?: Array<{ parsed?: ParsedSplInstruction }>;
    };
  };
  meta?: {
    logMessages?: string[];
    preTokenBalances?: TokenBalance[];
    postTokenBalances?: TokenBalance[];
    innerInstructions?: Array<{ instructions?: Array<{ parsed?: ParsedSplInstruction }> }>;
  };
};

export type ParsedGravestakeEvent = {
  signature: string;
  blockTime: number;
  eventType: Extract<NftActivityEventType, "stake" | "unstake">;
  mint: string;
  staker: string;
};

function accountKey(keys: ParsedTx["transaction"]["message"]["accountKeys"], index: number): string | null {
  const entry = keys[index];
  if (!entry) {
    return null;
  }
  return typeof entry === "string" ? entry : entry.pubkey ?? null;
}

function collectParsedInstructions(tx: ParsedTx): ParsedSplInstruction[] {
  const instructions: ParsedSplInstruction[] = [];

  for (const ix of tx.transaction.message.instructions ?? []) {
    if (ix.parsed?.type && ix.parsed.info) {
      instructions.push(ix.parsed);
    }
  }

  for (const block of tx.meta?.innerInstructions ?? []) {
    for (const ix of block.instructions ?? []) {
      if (ix.parsed?.type && ix.parsed.info) {
        instructions.push(ix.parsed);
      }
    }
  }

  return instructions;
}

export function parseGravestakeInstruction(logs: string[] | undefined): string | null {
  for (const line of logs ?? []) {
    const match = line.match(/Program log: Instruction: (\w+)/);
    if (match?.[1]) {
      return match[1];
    }
  }
  return null;
}

function isNftBalance(balance: TokenBalance): boolean {
  return balance.uiTokenAmount?.decimals === 0;
}

function stringField(info: Record<string, unknown>, key: string): string | null {
  const value = info[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function parseSoftStake(
  instructions: ParsedSplInstruction[],
  poolWallet: string,
): { mint: string; staker: string } | null {
  const pool = poolWallet.toLowerCase();

  for (const ix of instructions) {
    if (ix.type !== "approve") {
      continue;
    }

    const delegate = stringField(ix.info, "delegate")?.toLowerCase();
    const staker = stringField(ix.info, "owner");
    if (delegate !== pool || !staker) {
      continue;
    }

    const freeze = instructions.find((entry) => entry.type === "freezeAccount");
    const mint = freeze ? stringField(freeze.info, "mint") : null;
    if (mint) {
      return { mint, staker };
    }
  }

  return null;
}

function parseSoftUnstake(instructions: ParsedSplInstruction[]): { mint: string; staker: string } | null {
  for (const ix of instructions) {
    if (ix.type !== "revoke") {
      continue;
    }

    const staker = stringField(ix.info, "owner");
    if (!staker) {
      continue;
    }

    const thaw = instructions.find((entry) => entry.type === "thawAccount");
    const mint = thaw ? stringField(thaw.info, "mint") : null;
    if (mint) {
      return { mint, staker };
    }
  }

  return null;
}

function findHardStakeTransfer(
  tx: ParsedTx,
  poolWallet: string,
  eventType: "stake" | "unstake",
): { mint: string; staker: string } | null {
  const pre = tx.meta?.preTokenBalances ?? [];
  const post = tx.meta?.postTokenBalances ?? [];
  const pool = poolWallet.toLowerCase();

  if (eventType === "stake") {
    for (const after of post) {
      if (!isNftBalance(after) || after.uiTokenAmount?.uiAmount !== 1 || !after.mint) {
        continue;
      }

      const postOwner = after.owner?.toLowerCase();
      if (postOwner !== pool) {
        continue;
      }

      const before = pre.find((entry) => entry.accountIndex === after.accountIndex);
      const preOwner = before?.owner?.toLowerCase() ?? null;
      if (preOwner && preOwner !== pool) {
        return { mint: after.mint, staker: before!.owner! };
      }

      const emptied = pre.find(
        (entry) =>
          entry.mint === after.mint &&
          isNftBalance(entry) &&
          entry.uiTokenAmount?.uiAmount === 1 &&
          entry.owner?.toLowerCase() !== pool,
      );
      if (emptied?.owner) {
        return { mint: after.mint, staker: emptied.owner };
      }
    }
  }

  if (eventType === "unstake") {
    for (const before of pre) {
      if (!isNftBalance(before) || before.uiTokenAmount?.uiAmount !== 1 || !before.mint) {
        continue;
      }

      const preOwner = before.owner?.toLowerCase();
      if (preOwner !== pool) {
        continue;
      }

      const after = post.find((entry) => entry.accountIndex === before.accountIndex);
      const postOwner = after?.owner?.toLowerCase();
      if (postOwner && postOwner !== pool) {
        return { mint: before.mint, staker: after!.owner! };
      }

      const received = post.find(
        (entry) =>
          entry.mint === before.mint &&
          isNftBalance(entry) &&
          entry.uiTokenAmount?.uiAmount === 1 &&
          entry.owner?.toLowerCase() !== pool,
      );
      if (received?.owner) {
        return { mint: before.mint, staker: received.owner };
      }
    }
  }

  return null;
}

export function parseGravestakeTransaction(
  signature: string,
  blockTime: number,
  tx: ParsedTx,
  poolWallet: string,
): ParsedGravestakeEvent | null {
  const logs = tx.meta?.logMessages ?? [];
  const usesGravestake = logs.some((line) => line.includes(GRAVESTAKE_PROGRAM));
  if (!usesGravestake) {
    return null;
  }

  const instruction = parseGravestakeInstruction(logs);
  if (!instruction) {
    return null;
  }

  let eventType: "stake" | "unstake" | null = null;
  if (STAKE_INSTRUCTIONS.has(instruction)) {
    eventType = "stake";
  } else if (UNSTAKE_INSTRUCTIONS.has(instruction)) {
    eventType = "unstake";
  }

  if (!eventType) {
    return null;
  }

  const parsedInstructions = collectParsedInstructions(tx);
  let transfer: { mint: string; staker: string } | null = null;

  if (SOFT_STAKE_INSTRUCTIONS.has(instruction)) {
    transfer = parseSoftStake(parsedInstructions, poolWallet);
  } else if (SOFT_UNSTAKE_INSTRUCTIONS.has(instruction)) {
    transfer = parseSoftUnstake(parsedInstructions);
  } else {
    transfer = findHardStakeTransfer(tx, poolWallet, eventType);
  }

  if (!transfer) {
    return null;
  }

  const feePayer = accountKey(tx.transaction.message.accountKeys, 0);
  const staker = transfer.staker || feePayer;
  if (!staker) {
    return null;
  }

  return {
    signature,
    blockTime,
    eventType,
    mint: transfer.mint,
    staker,
  };
}
