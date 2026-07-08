import type { Metadata } from "next";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Card } from "@/components/ui/Card";
import { MerchStore } from "@/components/merch/merch-store";
import { merchContent, pageMeta } from "@/content/site";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({ ...pageMeta.merch, path: "/merch" });

export default function MerchPage() {
  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Merch"
        title={merchContent.title}
        description={merchContent.subtitle}
      />
      <Card className="border-l-2 border-l-accent-gold p-5">
        <p className="text-sm text-muted">{merchContent.note}</p>
      </Card>
      <MerchStore />
    </div>
  );
}
