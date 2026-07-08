import type { Metadata } from "next";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { RewardsDashboard } from "@/components/rewards/RewardsDashboard";
import { pageMeta } from "@/content/site";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({ ...pageMeta.rewards, path: "/rewards" });

export default function RewardsPage() {
  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Daily rewards"
        title="Holder rewards"
        description="Earn $BUX daily for wallet-held NFTs across BUXDAO collections. Link wallets in the Hub, hold NFTs in those wallets, and claim anytime."
      />
      <RewardsDashboard />
    </div>
  );
}
