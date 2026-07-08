"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const PRIZE_LABEL = "50,000 $EMPIRE";

export function EmpireTicker() {
  const [poolSize, setPoolSize] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/empire-draw/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { eligiblePoolSize?: number } | null) => {
        if (active && data && typeof data.eligiblePoolSize === "number") {
          setPoolSize(data.eligiblePoolSize);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const eligible = poolSize != null ? poolSize.toLocaleString() : "…";
  const message = (
    <>
      <span className="font-semibold text-accent-gold">Win {PRIZE_LABEL} every week!</span>
      <span className="text-foreground">Eligible holders: {eligible}</span>
      <span className="text-accent-cyan underline-offset-2 group-hover:underline">
        see details →
      </span>
    </>
  );

  return (
    <Link
      href="/empire-draw"
      className="group block overflow-hidden border-b border-border bg-accent-purple/10"
      aria-label={`Win ${PRIZE_LABEL} every week. Eligible holders: ${eligible}. See details.`}
    >
      <div className="ticker-track py-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex shrink-0 items-center gap-3 px-6 text-xs">
            {message}
            <span className="text-border-strong">•</span>
          </div>
        ))}
      </div>
    </Link>
  );
}
