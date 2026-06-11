type BadgeProps = {
  children: React.ReactNode;
  variant?: "live" | "beta" | "soon" | "default";
};

const variants = {
  live: "bg-accent-green/15 text-accent-green border-accent-green/30",
  beta: "bg-accent-cyan/15 text-accent-cyan border-accent-cyan/30",
  soon: "bg-white/5 text-muted border-border",
  default: "bg-white/5 text-foreground border-border",
};

export function Badge({ children, variant = "default" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider ${variants[variant]}`}
    >
      {children}
    </span>
  );
}
