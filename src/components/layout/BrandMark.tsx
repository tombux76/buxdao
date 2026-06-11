import Link from "next/link";
import { site } from "@/content/site";

type BrandMarkProps = {
  compact?: boolean;
};

export function BrandMark({ compact = false }: BrandMarkProps) {
  return (
    <Link href="/" className="block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={site.logoWordmark}
        alt={`${site.name} — ${site.tagline}`}
        className={
          compact
            ? "brand-wordmark h-9 w-auto max-w-[160px]"
            : "brand-wordmark h-auto w-full max-w-[220px]"
        }
      />
    </Link>
  );
}
