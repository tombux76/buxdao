"use client";

import { Wallet } from "lucide-react";
import { Card } from "@/components/ui/Card";
import {
  DiscordLoginButton,
  HubWalletButton,
  XLinkButton,
} from "@/components/hub/ProfileConnectActions";
import { useDiscordSession } from "@/hooks/useDiscordSession";
import { hubContent, site } from "@/content/site";

const stepMeta = [
  {
    thumbnail: "/brand/discord.svg",
    thumbnailClass: "h-10 w-10",
    invert: false,
  },
  {
    thumbnail: "/brand/x-logo.png",
    thumbnailClass: "h-10 w-10 object-contain",
    invert: false,
  },
  {
    thumbnail: null as string | null,
    thumbnailClass: "flex h-10 w-10 items-center justify-center rounded-lg bg-white/10",
    invert: false,
  },
  {
    thumbnail: "https://images.solanadeads.com/gravekeeper.png",
    thumbnailClass: "h-10 w-10 rounded-lg object-cover",
    invert: false,
  },
];

export function HubSetupSteps() {
  const { discordConnected, discordRequiredHint } = useDiscordSession();

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {hubContent.steps.map((step, index) => {
        const meta = stepMeta[index];

        return (
          <Card key={step.step} className="flex flex-col p-5">
            <div className="mb-4 flex gap-3">
              <div className="shrink-0">
                {step.step === 3 ? (
                  <div className={meta.thumbnailClass}>
                    <Wallet className="h-6 w-6 text-white" strokeWidth={2} />
                  </div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={meta.thumbnail!}
                    alt=""
                    className={meta.thumbnailClass}
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-purple/20 font-mono text-xs text-accent-purple">
                    {step.step}
                  </span>
                  <h3 className="font-semibold">{step.title}</h3>
                </div>
                <p className="text-sm text-muted">{step.body}</p>
              </div>
            </div>

            <div className="mt-auto pt-2">
              {step.step === 1 && <DiscordLoginButton fullWidth />}
              {step.step === 2 && <XLinkButton fullWidth />}
              {step.step === 3 && <HubWalletButton fullWidth />}
              {step.step === 4 &&
                (discordConnected ? (
                  <a
                    href={site.social.discord}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${"inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition"} border border-accent-gold/40 bg-accent-gold/10 text-accent-gold hover:bg-accent-gold/20`}
                  >
                    Verify in Discord
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled
                    title={discordRequiredHint}
                    className={`${"inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-55"} border border-accent-gold/40 bg-accent-gold/10 text-accent-gold`}
                  >
                    Verify in Discord
                  </button>
                ))}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
