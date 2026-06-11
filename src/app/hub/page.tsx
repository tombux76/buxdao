import { SectionHeader } from "@/components/ui/SectionHeader";
import { Card } from "@/components/ui/Card";
import { hubContent, site } from "@/content/site";

export default function HubPage() {
  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Holder Hub"
        title={hubContent.title}
        description={hubContent.subtitle}
      />

      <Card className="border-l-2 border-l-[#5865F2] p-5">
        <p className="text-sm text-[#5865F2]">{hubContent.verifyBanner}</p>
        <a
          href={site.social.discord}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block text-sm text-accent-cyan underline-offset-2 hover:underline"
        >
          Join Discord to verify →
        </a>
      </Card>

      <section>
        <SectionHeader eyebrow="Setup" title="How it works" />
        <div className="grid gap-4 md:grid-cols-2">
          {hubContent.steps.map((step) => (
            <Card key={step.step} className="p-5">
              <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-accent-purple/20 font-mono text-sm text-accent-purple">
                {step.step}
              </div>
              <h3 className="mb-2 font-semibold">{step.title}</h3>
              <p className="text-sm text-muted">{step.body}</p>
            </Card>
          ))}
        </div>
      </section>

      <Card glow="purple" className="space-y-4 p-5">
        <h3 className="text-lg font-semibold">Your dashboard</h3>
        <p className="text-sm text-muted">{hubContent.note}</p>

        <div className="flex flex-wrap gap-2">
          <button type="button" disabled className="rounded-xl border border-[#5865F2]/40 bg-[#5865F2]/10 px-4 py-2 text-sm text-[#5865F2] opacity-60">
            Connect Discord
          </button>
          <button type="button" disabled className="rounded-xl border border-border px-4 py-2 text-sm text-muted opacity-60">
            Connect X
          </button>
          <button type="button" disabled className="rounded-xl border border-border px-4 py-2 text-sm text-muted opacity-60">
            Connect wallet
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {["Fcked Catz", "Money Monsters", "A.I. BitBots", "MM 3D", "Celebrity Catz"].map(
            (name) => (
              <div
                key={name}
                className="tile-border rounded-xl border-dashed bg-bg-deep/50 p-4"
              >
                <p className="text-xs uppercase text-muted">{name}</p>
                <p className="mt-2 text-sm text-muted">NFT gallery — connect wallet</p>
              </div>
            ),
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="tile-border rounded-xl bg-bg-deep/50 p-4">
            <p className="text-xs uppercase text-muted">Discord roles</p>
            <p className="mt-1 text-sm text-muted">—</p>
          </div>
          <div className="tile-border rounded-xl bg-bg-deep/50 p-4">
            <p className="text-xs uppercase text-muted">$BUX balance</p>
            <p className="mt-1 font-mono text-accent-gold">—</p>
          </div>
          <div className="tile-border rounded-xl bg-bg-deep/50 p-4">
            <p className="text-xs uppercase text-muted">Cashout value</p>
            <p className="mt-1 font-mono text-accent-gold">— SOL</p>
          </div>
        </div>

        <button
          type="button"
          disabled
          className="w-full rounded-xl bg-gradient-to-r from-accent-purple to-accent-cyan py-3 text-sm font-semibold text-bg-deep opacity-50"
        >
          Cash out $BUX (coming soon)
        </button>
      </Card>
    </div>
  );
}
