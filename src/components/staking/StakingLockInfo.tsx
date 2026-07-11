import type { LucideIcon } from "lucide-react";
import { Clock, Lock, MessageCircle, Sparkles, Timer, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { stakingContent } from "@/content/site";

const LOCK_BONUS_ICONS: { icon: LucideIcon; iconClass: string; multiplierClass: string }[] = [
  {
    icon: Clock,
    iconClass: "bg-accent-cyan/15 text-accent-cyan ring-accent-cyan/20",
    multiplierClass: "text-accent-cyan",
  },
  {
    icon: Sparkles,
    iconClass: "bg-accent-gold/15 text-accent-gold ring-accent-gold/20",
    multiplierClass: "text-accent-gold",
  },
];

function LockBonusCard({
  days,
  multiplier,
  icon: Icon,
  iconClass,
  multiplierClass,
}: {
  days: number;
  multiplier: string;
  icon: LucideIcon;
  iconClass: string;
  multiplierClass: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-border/70 bg-bg-deep/50 p-4">
      <span
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ring-1 ${iconClass}`}
      >
        <Icon className="h-5 w-5" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs uppercase tracking-wide text-muted">Lock period</p>
        <p className="mt-0.5 font-mono text-lg font-semibold text-foreground">{days} days</p>
      </div>
      <div className="text-right">
        <p className="text-xs uppercase tracking-wide text-muted">Yield boost</p>
        <p className={`mt-0.5 flex items-center justify-end gap-1 font-mono text-lg font-semibold ${multiplierClass}`}>
          <TrendingUp className="h-4 w-4 shrink-0" strokeWidth={2.25} />
          {multiplier}
        </p>
      </div>
    </div>
  );
}

export function StakingLockInfo() {
  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-border/60 bg-gradient-to-br from-accent-cyan/10 via-bg-deep/40 to-accent-gold/5 px-5 py-5 sm:px-6">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-cyan/15 text-accent-cyan ring-1 ring-accent-cyan/25">
            <Lock className="h-5 w-5" strokeWidth={2} />
          </span>
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent-cyan">
              Lock bonuses
            </p>
            <h2 className="mt-1 text-lg font-semibold sm:text-xl">Earn more by locking longer</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
              {stakingContent.lockIntro}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3 px-5 py-5 sm:px-6">
        <div className="mb-1 flex items-center gap-2 text-sm font-medium text-foreground">
          <Timer className="h-4 w-4 text-accent-cyan" strokeWidth={2.25} />
          Bonus tiers
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {stakingContent.lockBonuses.map((bonus, index) => {
            const style = LOCK_BONUS_ICONS[index] ?? LOCK_BONUS_ICONS[0];
            return (
              <LockBonusCard
                key={bonus.days}
                days={bonus.days}
                multiplier={bonus.multiplier}
                icon={style.icon}
                iconClass={style.iconClass}
                multiplierClass={style.multiplierClass}
              />
            );
          })}
        </div>

        <div className="flex gap-3 rounded-xl border border-border/60 bg-bg-surface/30 px-4 py-3.5">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#5865F2]/15 text-[#5865F2]">
            <MessageCircle className="h-4 w-4" strokeWidth={2.25} />
          </span>
          <p className="text-sm leading-relaxed text-muted">{stakingContent.note}</p>
        </div>
      </div>
    </Card>
  );
}
