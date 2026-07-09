import { tokenConfig } from "@/content/site";

export type CasinoFeeConfig = {
  projectWallet: string;
  treasuryWallet: string;
  purchaseFeeLamports: number;
  feeToProjectLamports: number;
  feeToTreasuryGasLamports: number;
};

export function getCasinoFeeConfig(): CasinoFeeConfig {
  const projectWallet =
    process.env.PROJECT_WALLET?.trim() ||
    process.env.NEXT_PUBLIC_PROJECT_WALLET?.trim() ||
    tokenConfig.communityWallet;
  const treasuryWallet =
    process.env.TREASURY_WALLET?.trim() || tokenConfig.buxTreasuryWallet;

  const purchaseFeeLamports = Number.parseInt(
    process.env.CASINO_PURCHASE_FEE_LAMPORTS ?? "2000000",
    10,
  );
  const feeToProjectLamports = Number.parseInt(
    process.env.CASINO_FEE_TO_PROJECT_LAMPORTS ?? "1500000",
    10,
  );
  const feeToTreasuryGasLamports = Number.parseInt(
    process.env.CASINO_FEE_TO_TREASURY_GAS_LAMPORTS ?? "500000",
    10,
  );

  return {
    projectWallet,
    treasuryWallet,
    purchaseFeeLamports,
    feeToProjectLamports,
    feeToTreasuryGasLamports,
  };
}
