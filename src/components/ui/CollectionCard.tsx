import Image from "next/image";
import { Card } from "./Card";
import type { CollectionWithStats } from "@/lib/collections";

type CollectionCardProps = {
  collection: CollectionWithStats;
};

function StatPair({
  left,
  right,
}: {
  left: { label: string; value: string };
  right: { label: string; value: string };
}) {
  return (
    <dl className="grid grid-cols-2 border-t border-border-gold/30">
      {[left, right].map((stat, index) => (
        <div
          key={stat.label}
          className={`px-4 py-3 sm:px-5 sm:py-4 ${index === 0 ? "border-r border-border-gold/20" : ""}`}
        >
          <dt className="text-xs uppercase tracking-wide text-muted">{stat.label}</dt>
          <dd className="mt-1 font-mono text-base font-semibold text-foreground sm:text-lg">
            {stat.value}
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

          <StatPair
            left={{ label: "Floor price", value: collection.floor }}
            right={{ label: "24hr volume", value: collection.volume24h }}
          />
          <StatPair
            left={{ label: "Supply", value: collection.supply }}
            right={{ label: "Listed", value: collection.listed }}
          />
        </div>
      </div>
    </Card>
  );
}
