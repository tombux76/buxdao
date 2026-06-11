import Image from "next/image";
import { Card } from "./Card";
import type { CollectionWithStats } from "@/lib/collections";

type CollectionCardProps = {
  collection: CollectionWithStats;
};

const STAT_ROWS: {
  label: string;
  key: keyof Pick<
    CollectionWithStats,
    "floor" | "volume24h" | "totalVolume" | "supply" | "listed" | "percentListed"
  >;
}[][] = [
  [
    { label: "Floor price", key: "floor" },
    { label: "24hr volume", key: "volume24h" },
    { label: "Total volume", key: "totalVolume" },
  ],
  [
    { label: "Supply", key: "supply" },
    { label: "Listed", key: "listed" },
    { label: "% listed", key: "percentListed" },
  ],
];

function StatGrid({
  collection,
  row,
  showTopBorder,
}: {
  collection: CollectionWithStats;
  row: (typeof STAT_ROWS)[number];
  showTopBorder?: boolean;
}) {
  return (
    <dl
      className={`grid grid-cols-3 ${showTopBorder ? "border-t border-border-gold/30" : ""}`}
    >
      {row.map((stat, index) => (
        <div
          key={stat.key}
          className={`px-2 py-4 text-center ${
            index < row.length - 1 ? "border-r border-border-gold/20" : ""
          }`}
        >
          <dt className="text-xs uppercase tracking-wide text-muted">{stat.label}</dt>
          <dd className="mt-1.5 font-mono text-base font-semibold text-foreground sm:text-lg">
            {collection[stat.key]}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function CollectionCard({ collection }: CollectionCardProps) {
  return (
    <Card className="group overflow-hidden rounded-2xl p-0">
      <div className="relative aspect-square w-full overflow-hidden rounded-t-[calc(1rem-3px)]">
        <Image
          src={collection.gif}
          alt={collection.name}
          fill
          unoptimized
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="object-cover object-center scale-[1.02]"
        />
      </div>

      <div className="border-t border-border-gold/30 px-5 pt-4 pb-1">
        <h3 className="text-xl font-semibold sm:text-2xl">{collection.name}</h3>
        <p className="font-mono text-xs text-muted">{collection.symbol}</p>
      </div>

      <StatGrid collection={collection} row={STAT_ROWS[0]} showTopBorder />
      <StatGrid collection={collection} row={STAT_ROWS[1]} showTopBorder />

      <div className="flex justify-center border-t border-border-gold/30 px-5 py-4">
        <a
          href={collection.graveMarketUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Trade ${collection.name} on GraveMarket`}
          className="tile-border block overflow-hidden rounded-xl bg-bg-deep/80 px-2 py-1 transition hover:scale-[1.02]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/gravemarket.png"
            alt="GraveMarket"
            className="h-9 w-auto max-w-full rounded-md object-contain sm:h-10"
          />
        </a>
      </div>
    </Card>
  );
}
