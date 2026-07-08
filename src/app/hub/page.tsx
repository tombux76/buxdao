import type { Metadata } from "next";
import { Suspense } from "react";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Card } from "@/components/ui/Card";
import { HubAuthErrors } from "@/components/hub/HubAuthErrors";
import { HubProfileCard } from "@/components/hub/HubProfileCard";
import { HubClaimSection } from "@/components/hub/HubClaimSection";
import { HubSetupSteps } from "@/components/hub/HubSetupSteps";
import { HubDashboard } from "@/components/hub/HubDashboard";
import { hubContent, pageMeta, site } from "@/content/site";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({ ...pageMeta.hub, path: "/hub" });

export default function HubPage() {
  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Holder Hub"
        title={hubContent.title}
        description={hubContent.subtitle}
      />

      <Suspense fallback={null}>
        <HubAuthErrors />
      </Suspense>

      <Card className="border-l-2 border-l-[#5865F2] p-5">
        <p className="text-sm text-[#5865F2]">{hubContent.verifyBanner}</p>
        <a
          href={site.social.discord}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block text-sm text-accent-cyan underline-offset-2 hover:underline"
        >
          Join Discord to verify →
        </a>
      </Card>

      <section>
        <SectionHeader eyebrow="Setup" title="How it works" />
        <HubSetupSteps />
      </section>

      <Card glow="purple" className="space-y-4 p-5">
        <h3 className="text-lg font-semibold">Your dashboard</h3>
        <HubProfileCard />
        <HubClaimSection />
        <HubDashboard />
      </Card>
    </div>
  );
}
