import { CollectionCard } from "@/components/ui/CollectionCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Card } from "@/components/ui/Card";
import { getCollectionsWithStats } from "@/lib/collections";

export const revalidate = 120;

export default async function CollectionsPage() {
  const collections = await getCollectionsWithStats();

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Collections"
        title="5 main NFT families"
        description="Showcase powered by GraveMarket — buy and sell on their marketplace."
      />
      <Card className="border-l-2 border-l-accent-gold">
        <p className="text-sm text-muted">
          Live stats from Magic Eden and Helius (supply counted on-chain). Trade links go
          directly to GraveMarket.
        </p>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {collections.map((collection) => (
          <CollectionCard key={collection.id} collection={collection} />
        ))}
      </div>
    </div>
  );
}
