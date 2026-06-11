import { CollectionCard } from "@/components/ui/CollectionCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {collections.map((collection) => (
          <CollectionCard key={collection.id} collection={collection} />
        ))}
      </div>
    </div>
  );
}
