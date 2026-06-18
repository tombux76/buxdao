import { getRecentAccruals } from "@/lib/holder-rewards/accrual";
import { getRewardAccount } from "@/lib/holder-rewards/accounts";
import { buxRawToNumber, HOLDER_REWARDS_CLAIM_FEE_LAMPORTS } from "@/lib/holder-rewards/config";
import { listLinkedWalletAddresses } from "@/lib/holder-rewards/wallet-auth";

export async function getHolderRewardState(userId: string) {
  const [account, recentAccruals, linkedWallets] = await Promise.all([
    getRewardAccount(userId),
    getRecentAccruals(userId),
    listLinkedWalletAddresses(userId),
  ]);

  return {
    unclaimedBalanceBux: account.unclaimedBalanceBux,
    totalClaimedBux: account.totalClaimedBux,
    claimFeeSol: HOLDER_REWARDS_CLAIM_FEE_LAMPORTS / 1e9,
    linkedWallets,
    recentAccruals: recentAccruals.map((row) => ({
      rewardDateEt: row.reward_date_et,
      amountBux: buxRawToNumber(row.amount_raw),
      nftCount: row.nft_count,
    })),
  };
}
