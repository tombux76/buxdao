import Image from "next/image";
import { Card } from "./Card";
import type { CollectionWithStats } from "@/lib/collections";

type CollectionCardProps = {
  collection: CollectionWithStats;
};

function StatRow({
  collection,
  stats,
}: {
  collection: CollectionWithStats;
  stats: {
    label: string;
    key: keyof Pick<
      CollectionWithStats,
      "floor" | "volume24h" | "totalVolume" | "supply" | "listed" | "percentListed"
    >;
  }[];
}) {
  return (
    <dl className="grid grid-cols-3 border-t border-border-gold/30">
      {stats.map((stat, index) => (
        <div
          key={stat.key}
          className={`px-3 py-3 text-center sm:px-4 sm:py-4 ${
            index < stats.length - 1 ? "border-r border-border-gold/20" : ""
          }`}
        >
          <dt className="text-xs uppercase tracking-wide text-muted">{stat.label}</dt>
          <dd className="mt-1 font-mono text-sm font-semibold text-foreground sm:text-base lg:text-lg">
            {collection[stat.key]}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function CollectionCard({ collection }: CollectionCardProps) {
  return (
    <Card className="overflow-hidden rounded-2xl p-0">
      <div className="flex flex-col sm:flex-row">
        <div className="relative aspect-square w-full shrink-0 overflow-hidden sm:aspect-auto sm:h-auto sm:w-40 md:w-48 lg:w-56">
          <Image
            src={collection.gif}
            alt={collection.name}
            fill
            unoptimized
            sizes="(max-width: 640px) 100vw, 224px"
            className="object-cover object-center scale-[1.02]"
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-gold/30 px-4 py-4 sm:px-5">
            <div className="min-w-0">
              <h3 className="text-xl font-semibold sm:text-2xl">{collection.name}</h3>
              <p className="font-mono text-xs text-muted">{collection.id}</p>
            </div>
            <a
              href={collection.graveMarketUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Trade ${collection.name} on GraveMarket`}
              className="tile-border shrink-0 overflow-hidden rounded-xl bg-bg-deep/80 px-2 py-1 transition hover:scale-[1.02]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand/gravemarket.png"
                alt="GraveMarket"
                className="h-9 w-auto max-w-full rounded-md object-contain sm:h-10"
              />
            </a>
          </div>

          <StatRow
            collection={collection}
            stats={[
              { label: "Floor price", key: "floor" },
              { label: "24hr volume", key: "volume24h" },
              { label: "Total volume", key: "totalVolume" },
            ]}
          />
          <StatRow
            collection={collection}
            stats={[
              { label: "Supply", key: "supply" },
              { label: "Listed", key: "listed" },
              { label: "% listed", key: "percentListed" },
            ]}
          />
        </div>
      </div>
    </Card>
  );
}
