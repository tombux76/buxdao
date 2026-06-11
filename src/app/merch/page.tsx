import Image from "next/image";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Card } from "@/components/ui/Card";
import { merchContent, merchProducts } from "@/content/site";

const categories = [
  { key: "all", label: "All" },
  { key: "bux", label: "BUXDAO" },
  { key: "catz", label: "Fcked Catz" },
  { key: "bitbots", label: "BitBots" },
  { key: "monsters", label: "Money Monsters" },
] as const;

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

      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <span
            key={cat.key}
            className="rounded-lg border border-border bg-bg-surface px-3 py-1.5 text-xs text-muted"
          >
            {cat.label}
          </span>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {merchProducts.map((product) => (
          <Card key={product.id} className="overflow-hidden p-0">
            <div className="relative aspect-square bg-bg-deep">
              <Image
                src={product.image}
                alt={product.name}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 33vw"
              />
            </div>
            <div className="p-4">
              <p className="text-xs uppercase tracking-wider text-muted">{product.type}</p>
              <h3 className="font-semibold">{product.name}</h3>
              <p className="mt-1 font-mono text-sm text-accent-gold">{product.price}</p>
              <button
                type="button"
                disabled
                className="mt-3 w-full rounded-lg border border-border py-2 text-sm text-muted opacity-60"
              >
                Add to cart (soon)
              </button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
