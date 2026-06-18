import { collectionConfigs, tokenConfig } from "@/content/site";

const STAKING_WALLETS = new Set(
  collectionConfigs
    .map((c) => c.stakingWallet)
    .filter((w): w is string => Boolean(w)),
);

const EXCLUDED_OWNERS = new Set<string>([
  ...tokenConfig.exemptWallets,
  ...STAKING_WALLETS,
]);

export function isExcludedOwner(owner: string | null | undefined): boolean {
  if (!owner) {
    return true;
  }
  return EXCLUDED_OWNERS.has(owner);
}

export function getExcludedOwners(): string[] {
  return [...EXCLUDED_OWNERS];
}
