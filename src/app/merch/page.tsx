import { SectionHeader } from "@/components/ui/SectionHeader";
import { Card } from "@/components/ui/Card";
import { MerchStore } from "@/components/merch/merch-store";
import { merchContent } from "@/content/site";

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
