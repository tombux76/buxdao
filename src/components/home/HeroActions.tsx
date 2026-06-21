"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { EngageToEarnModal } from "@/components/home/EngageToEarnModal";

export function HeroActions() {
  const [engageOpen, setEngageOpen] = useState(false);

  return (
    <>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/hub"
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-accent-purple to-accent-cyan px-5 py-2.5 text-sm font-semibold text-bg-deep transition hover:opacity-90"
        >
          Open Holder Hub
          <ArrowRight className="h-4 w-4" />
        </Link>
        <button
          type="button"
          onClick={() => setEngageOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl border border-border px-5 py-2.5 text-sm font-semibold text-foreground transition hover:border-border-strong"
        >
          Engage to earn
        </button>
      </div>

      {engageOpen && <EngageToEarnModal onClose={() => setEngageOpen(false)} />}
    </>
  );
}
