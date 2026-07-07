"use client";

import type { LucideIcon } from "lucide-react";
import {
  Dices,
  Gem,
  Globe2,
  Sparkles,
  Ticket,
  TrendingUp,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { buxPage } from "@/content/site";

const REVENUE_ICONS: Record<string, { icon: LucideIcon; iconClass: string }> = {
  "Collection royalties": { icon: Gem, iconClass: "bg-accent-gold/15 text-accent-gold" },
  "BUX Casino": { icon: Dices, iconClass: "bg-accent-purple/15 text-accent-purple" },
  "Slotto.gg": { icon: Ticket, iconClass: "bg-accent-cyan/15 text-accent-cyan" },
  "Partner sites": { icon: Globe2, iconClass: "bg-accent-green/15 text-accent-green" },
};

function RevenueCard({
  icon: Icon,
  iconClass,
  title,
  description,
}: {
  icon: LucideIcon;
  iconClass: string;
  title: string;
  description: string;
}) {
  return (
    <li className="rounded-xl border border-border/70 bg-bg-surface/30 p-4">
      <div className="flex gap-3">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconClass}`}
        >
          <Icon className="h-5 w-5" strokeWidth={2} />
        </span>
        <div>
          <p className="font-medium">{title}</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>
        </div>
      </div>
    </li>
  );
}

export function BuxRevenueSection() {
  return (
    <section>
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent-gold/20 to-accent-cyan/15 ring-1 ring-accent-gold/20">
          <TrendingUp className="h-5 w-5 text-accent-gold" />
        </span>
        <div>
          <h2 className="text-xl font-semibold">Revenue sources</h2>
          <p className="text-sm text-muted">SOL flowing into the liquidity wallet</p>
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        <ul className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
          {buxPage.revenueSources.map((source) => {
            const meta = REVENUE_ICONS[source.title] ?? {
              icon: Globe2,
              iconClass: "bg-bg-surface text-muted",
            };
            return (
              <RevenueCard
                key={source.title}
                icon={meta.icon}
                iconClass={meta.iconClass}
                title={source.title}
                description={source.description}
              />
            );
          })}
        </ul>

        <div className="border-t border-border/50 bg-gradient-to-r from-accent-purple/5 to-accent-gold/5 p-4 sm:p-5">
          <div className="flex gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-purple/15 text-accent-purple">
              <Sparkles className="h-5 w-5" />
            </span>
            <div>
              <p className="font-medium">{buxPage.revenueHighlight.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                {buxPage.revenueHighlight.description}
              </p>
            </div>
          </div>
        </div>
      </Card>
    </section>
  );
}
