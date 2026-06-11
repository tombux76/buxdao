import Image from "next/image";
import { Card } from "./Card";
import type { CollectionWithStats } from "@/lib/collections";

type CollectionCardProps = {
  collection: CollectionWithStats;
};

export function CollectionCard({ collection }: CollectionCardProps) {
  return (
    <Card className="group overflow-hidden p-0">
      <div
        className="relative aspect-square w-full overflow-hidden border-b-[3px] border-border-gold/40"
        style={{ boxShadow: `inset 0 -24px 48px ${collection.accent}18` }}
      >
        <Image
          src={collection.gif}
          alt={collection.name}
          fill
          unoptimized
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="object-cover object-center"
        />
      </div>

      <div className="p-5">
        <div className="mb-4">
          <h3 className="font-semibold">{collection.name}</h3>
          <p className="font-mono text-xs text-muted">{collection.symbol}</p>
        </div>

        <div className="mb-4 space-y-2">
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div className="tile-border rounded-lg bg-bg-deep/60 px-2 py-2">
              <dt className="text-[10px] uppercase text-muted">Floor price</dt>
              <dd className="mt-0.5 font-mono text-xs">{collection.floor}</dd>
            </div>
            <div className="tile-border rounded-lg bg-bg-deep/60 px-2 py-2">
              <dt className="text-[10px] uppercase text-muted">24hr volume</dt>
              <dd className="mt-0.5 font-mono text-xs">{collection.volume24h}</dd>
            </div>
            <div className="tile-border rounded-lg bg-bg-deep/60 px-2 py-2">
              <dt className="text-[10px] uppercase text-muted">Total volume</dt>
              <dd className="mt-0.5 font-mono text-xs">{collection.totalVolume}</dd>
            </div>
          </dl>
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div className="tile-border rounded-lg bg-bg-deep/60 px-2 py-2">
              <dt className="text-[10px] uppercase text-muted">Supply</dt>
              <dd className="mt-0.5 font-mono text-xs">{collection.supply}</dd>
            </div>
            <div className="tile-border rounded-lg bg-bg-deep/60 px-2 py-2">
              <dt className="text-[10px] uppercase text-muted">Listed</dt>
              <dd className="mt-0.5 font-mono text-xs">{collection.listed}</dd>
            </div>
            <div className="tile-border rounded-lg bg-bg-deep/60 px-2 py-2">
              <dt className="text-[10px] uppercase text-muted">% listed</dt>
              <dd className="mt-0.5 font-mono text-xs">{collection.percentListed}</dd>
            </div>
          </dl>
        </div>

        <div className="flex justify-center py-2">
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
      </div>
    </Card>
  );
}
