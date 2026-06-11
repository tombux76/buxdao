"use client";

import { BrandMark } from "./BrandMark";
import { site } from "@/content/site";

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg-deep/85 backdrop-blur-md">
      <div className="relative h-14 w-full">
        <p className="absolute left-[50vw] top-1/2 hidden -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-sm text-muted lg:block">
          <span className="text-accent-cyan">●</span> {site.tagline}
        </p>

        <div className="absolute left-4 top-1/2 -translate-y-1/2 lg:hidden">
          <BrandMark compact />
        </div>

        <div className="absolute right-4 top-1/2 flex -translate-y-1/2 items-center gap-2">
          <a
            href={site.social.discord}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Discord"
            className="rounded-lg border border-border p-2 transition hover:border-border-strong hover:bg-bg-surface"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/discord.svg" alt="" className="h-5 w-5" />
          </a>
          <a
            href={site.social.x}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="X"
            className="rounded-lg border border-border p-2 transition hover:border-border-strong hover:bg-bg-surface"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/x-logo.png" alt="" className="h-5 w-5 object-contain" />
          </a>
        </div>
      </div>
    </header>
  );
}
