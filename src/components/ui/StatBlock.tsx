type StatBlockProps = {
  label: string;
  value: string;
  sub?: string;
};

export function StatBlock({ label, value, sub }: StatBlockProps) {
  return (
    <div className="tile-border rounded-xl bg-bg-surface/80 px-4 py-3">
      <p className="text-xs uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-1 font-mono text-xl font-semibold text-foreground">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}
