"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ArrowRight, X } from "lucide-react";
import { discordEngagement } from "@/content/site";

type EngageToEarnModalProps = {
  onClose: () => void;
};

export function EngageToEarnModal({ onClose }: EngageToEarnModalProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="glass-panel max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="engage-to-earn-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-[#5865F2]">Discord rewards</p>
              <h2 id="engage-to-earn-title" className="mt-1 text-2xl font-bold">
                {discordEngagement.modalTitle}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-muted transition hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <p className="text-sm leading-relaxed text-muted">{discordEngagement.intro}</p>

          <section className="mt-6 space-y-2">
            <h3 className="text-sm font-semibold">{discordEngagement.eligibility.title}</h3>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted">
              {discordEngagement.eligibility.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="mt-6 space-y-3">
            <h3 className="text-sm font-semibold">{discordEngagement.rewards.title}</h3>
            <div className="space-y-2">
              {discordEngagement.rewards.items.map((item) => (
                <div
                  key={item.label}
                  className="rounded-xl border border-border bg-bg-deep/40 px-4 py-3"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium">{item.label}</span>
                    <span className="font-mono text-sm text-accent-gold">{item.amount}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">{item.detail}</p>
                </div>
              ))}
            </div>
            <ul className="list-disc space-y-1 pl-5 text-xs text-muted">
              {discordEngagement.rewards.limits.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="mt-6 space-y-2">
            <h3 className="text-sm font-semibold">{discordEngagement.channels.title}</h3>
            <div className="space-y-2">
              {discordEngagement.channels.items.map((item) => (
                <div key={item.label} className="text-sm">
                  <span className="font-medium">{item.label}</span>
                  <span className="text-muted"> — {item.detail}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-6 space-y-2">
            <h3 className="text-sm font-semibold">{discordEngagement.claim.title}</h3>
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted">
              {discordEngagement.claim.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </section>

          <Link
            href="/hub"
            onClick={onClose}
            className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-accent-purple to-accent-cyan px-5 py-2.5 text-sm font-semibold text-bg-deep transition hover:opacity-90"
          >
            {discordEngagement.cta}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
