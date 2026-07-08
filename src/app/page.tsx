import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { HeroCarousel } from "@/components/home/HeroCarousel";
import { HeroActions } from "@/components/home/HeroActions";
import { HeroTitle } from "@/components/home/HeroTitle";
import { LiveProductStrip } from "@/components/ui/LiveProductStrip";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Card } from "@/components/ui/Card";
import { hero, liveProducts, pageMeta, site, whiteLabel } from "@/content/site";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({ ...pageMeta.home, path: "/" });

export default function HomePage() {
  return (
    <div className="space-y-12">
      <section className="grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-12">
        <div className="order-2 lg:order-1">
          <HeroTitle title={hero.title} subtitle={hero.subtitle} />
          <HeroActions />
        </div>
        <div className="order-1 lg:order-2">
          <HeroCarousel />
        </div>
      </section>

      <section>
        <SectionHeader eyebrow="Products" title="What's live" />
        <LiveProductStrip products={liveProducts} />
      </section>

      <section>
        <Card glow="purple" className="p-5">
          <h2 className="text-xl font-semibold">{whiteLabel.title}</h2>
          <p className="mt-3 max-w-2xl text-sm text-muted">{whiteLabel.body}</p>
          <a
            href={site.social.discord}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm text-foreground transition hover:border-border-strong"
          >
            {whiteLabel.cta}
            <ArrowRight className="h-4 w-4" />
          </a>
        </Card>
      </section>
    </div>
  );
}
