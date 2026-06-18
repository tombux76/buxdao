import { readFileSync } from "node:fs";
import { join } from "node:path";

type MintListFile = { allMints?: string[]; mints?: string[] };

function loadMintSet(file: MintListFile): Set<string> {
  const list = file.allMints ?? file.mints ?? [];
  return new Set(list);
}

function loadJsonMintSet(filename: string): Set<string> {
  const path = join(process.cwd(), "data/rewards", filename);
  const parsed = JSON.parse(readFileSync(path, "utf8")) as MintListFile;
  return loadMintSet(parsed);
}

const BRANDED_MERCH_MINTS = loadJsonMintSet("fcked-catz-branded-merch-mints.json");
const TOP10_MM_MINTS = loadJsonMintSet("money-monsters-top10-mints.json");
const TOP10_MM3D_MINTS = loadJsonMintSet("money-monsters-3d-top10-mints.json");

export function getTraitMultiplier(mint: string, collectionId: string): number {
  if (collectionId === "fcked-catz" && BRANDED_MERCH_MINTS.has(mint)) {
    return 2;
  }
  return 1;
}

export function getRankMultiplier(mint: string, collectionId: string): number {
  if (collectionId === "money-monsters" && TOP10_MM_MINTS.has(mint)) {
    return 4;
  }
  if (collectionId === "money-monsters-3d" && TOP10_MM3D_MINTS.has(mint)) {
    return 4;
  }
  return 1;
}

export function getBonusMultiplier(mint: string, collectionId: string): number {
  return getTraitMultiplier(mint, collectionId) * getRankMultiplier(mint, collectionId);
}

export function getMultiplierSummary(): {
  brandedMerchCount: number;
  top10MmCount: number;
  top10Mm3dCount: number;
} {
  return {
    brandedMerchCount: BRANDED_MERCH_MINTS.size,
    top10MmCount: TOP10_MM_MINTS.size,
    top10Mm3dCount: TOP10_MM3D_MINTS.size,
  };
}
