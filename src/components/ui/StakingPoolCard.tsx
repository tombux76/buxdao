import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { Card } from "./Card";
import { Badge } from "./Badge";
import type { StakingPoolWithStats } from "@/lib/gravestake";

type StakingPoolCardProps = {
  pool: StakingPoolWithStats;
};

function StatRow({
  pool,
  stats,
}: {
  pool: StakingPoolWithStats;
  stats: {
    label: string;
    key: keyof Pick<StakingPoolWithStats, "supply" | "staked" | "percentStaked">;
  }[];
}) {
  return (
    <dl className="grid grid-cols-3 border-t border-border-gold/30">
      {stats.map((stat, index) => (
        <div
          key={stat.key}
          className={`px-3 py-3 text-center sm:px-4 sm:py-4 ${
            index < stats.length - 1 ? "border-r border-border-gold/20" : ""
          }`}
        >
          <dt className="text-xs uppercase tracking-wide text-muted">{stat.label}</dt>
          <dd className="mt-1 font-mono text-sm font-semibold text-foreground sm:text-base lg:text-lg">
            {pool[stat.key]}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function StakingPoolCard({ pool }: StakingPoolCardProps) {
  return (
    <Card glow={pool.stakeLive ? "cyan" : "none"} className="overflow-hidden rounded-2xl p-0">
      <div className="flex flex-col sm:flex-row">
        <div className="relative aspect-square w-full shrink-0 overflow-hidden sm:aspect-auto sm:h-auto sm:w-40 md:w-48 lg:w-56">
          <Image
            src={pool.gif}
            alt={pool.name}
            fill
            unoptimized
            sizes="(max-width: 640px) 100vw, 224px"
            className="object-cover object-center scale-[1.02]"
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-gold/30 px-4 py-4 sm:px-5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-xl font-semibold sm:text-2xl">{pool.name}</h3>
                <Badge variant={pool.stakeLive ? "live" : "soon"}>
                  {pool.stakeLive ? "live" : "coming soon"}
                </Badge>
              </div>
              <p className="font-mono text-xs text-muted">{pool.id}</p>
              <p className="mt-1 font-mono text-sm text-accent-gold sm:text-base">
                {pool.dailyBuxYield} $BUX <span className="text-muted">/ day</span>
              </p>
            </div>
            <a
              href={pool.graveStakeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-4 py-2.5 text-sm font-medium transition ${
                pool.stakeLive
                  ? "border-accent-cyan/40 bg-accent-cyan/10 text-accent-cyan hover:bg-accent-cyan/20"
                  : "border-border bg-bg-surface text-muted"
              }`}
            >
              Stake on GraveStake
              <ArrowUpRight className="h-4 w-4" />
            </a>
          </div>

          <StatRow
            pool={pool}
            stats={[
              { label: "Supply", key: "supply" },
              { label: "Staked", key: "staked" },
              { label: "% staked", key: "percentStaked" },
            ]}
          />
        </div>
      </div>
    </Card>
  );
}
