import type { Metadata } from "next";
import { StakingLockInfo } from "@/components/staking/StakingLockInfo";
import { StakingPoolCard } from "@/components/ui/StakingPoolCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { pageMeta, stakingContent } from "@/content/site";
import { getStakingPoolsWithStats } from "@/lib/gravestake";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({ ...pageMeta.staking, path: "/staking" });

export const revalidate = 120;

export default async function StakingPage() {
  const pools = await getStakingPoolsWithStats();

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Staking"
        title={stakingContent.title}
        description={stakingContent.subtitle}
      />
      <StakingLockInfo />
      <div className="flex flex-col gap-4">
        {pools.map((pool) => (
          <StakingPoolCard key={pool.id} pool={pool} />
        ))}
      </div>
    </div>
  );
}
