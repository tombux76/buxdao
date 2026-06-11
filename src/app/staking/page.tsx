import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { collections, stakingContent } from "@/content/site";

export default function StakingPage() {
  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Staking"
        title={stakingContent.title}
        description={stakingContent.subtitle}
      />
      <Card className="border-l-2 border-l-accent-cyan">
        <p className="text-sm text-muted">{stakingContent.lockIntro}</p>
        <ul className="mt-3 space-y-1 text-sm text-foreground">
          {stakingContent.lockBonuses.map((bonus) => (
            <li key={bonus.days} className="font-mono">
              {bonus.days} days = {bonus.multiplier}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-muted">{stakingContent.note}</p>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {collections.map((collection) => (
          <Card key={collection.id}>
            <div className="mb-4 flex items-center gap-3">
              <div className="tile-border relative h-14 w-14 overflow-hidden rounded-xl">
                <Image
                  src={collection.logo}
                  alt={collection.name}
                  fill
                  sizes="56px"
                  className="object-cover"
                />
              </div>
              <div>
                <h3 className="font-semibold">{collection.name}</h3>
                <Badge variant={collection.stakeLive ? "live" : "soon"}>
                  {collection.stakeLive ? "live" : "coming soon"}
                </Badge>
              </div>
            </div>
            <p className="mb-4 font-mono text-lg text-accent-gold">
              {collection.dailyBuxYield} $BUX <span className="text-sm text-muted">/ day</span>
            </p>
            <a
              href={collection.graveStakeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center gap-1 text-sm ${
                collection.stakeLive ? "text-accent-cyan" : "text-muted"
              }`}
            >
              Stake on GraveStake
              <ArrowUpRight className="h-4 w-4" />
            </a>
          </Card>
        ))}
      </div>
    </div>
  );
}
