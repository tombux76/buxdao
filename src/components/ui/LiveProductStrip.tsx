import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Gamepad2 } from "lucide-react";
import { Badge } from "./Badge";
import type { LiveProduct } from "@/content/site";

type LiveProductStripProps = {
  products: LiveProduct[];
};

function ProductTile({ product }: { product: LiveProduct }) {
  return (
    <div
      className={`glass-panel flex h-full w-full items-center gap-3 rounded-xl border border-border/70 bg-bg-surface/80 px-4 py-3 transition hover:border-border-strong ${
        product.status === "soon" ? "opacity-70" : ""
      }`}
    >
      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-border/70 bg-bg-deep">
        {product.thumbnail ? (
          <Image
            src={product.thumbnail}
            alt={product.name}
            fill
            unoptimized
            sizes="48px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted">
            <Gamepad2 className="h-5 w-5 opacity-40" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{product.name}</p>
        <Badge variant={product.status === "live" ? "live" : "soon"}>
          {product.status}
        </Badge>
      </div>

      {product.status === "live" && (
        <ArrowUpRight className="h-4 w-4 shrink-0 text-accent-cyan" />
      )}
    </div>
  );
}

export function LiveProductStrip({ products }: LiveProductStripProps) {
  return (
    <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {products.map((product) => {
        if (product.status === "soon") {
          return (
            <div key={product.id} className="min-w-0">
              <ProductTile product={product} />
            </div>
          );
        }

        if (product.external) {
          return (
            <a
              key={product.id}
              href={product.href}
              target="_blank"
              rel="noopener noreferrer"
              className="block min-w-0"
            >
              <ProductTile product={product} />
            </a>
          );
        }

        return (
          <Link key={product.id} href={product.href} className="block min-w-0">
            <ProductTile product={product} />
          </Link>
        );
      })}
    </div>
  );
}
