import { getTickerItems } from "@/lib/collections";

export async function Ticker() {
  const tickerItems = await getTickerItems();
  const items = [...tickerItems, ...tickerItems];

  return (
    <div className="overflow-hidden border-b border-border bg-bg-elevated/80">
      <div className="ticker-track py-2">
        {items.map((item, i) => (
          <div
            key={`${item.label}-${i}`}
            className="flex shrink-0 items-center gap-3 px-6 text-xs"
          >
            <span className="font-medium text-foreground">{item.label}</span>
            <span className="font-mono text-muted">{item.value}</span>
            <span className="text-accent-gold">{item.change}</span>
            <span className="text-border-strong">•</span>
          </div>
        ))}
      </div>
    </div>
  );
}
