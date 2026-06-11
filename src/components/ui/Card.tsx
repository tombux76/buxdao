type CardProps = {
  children: React.ReactNode;
  className?: string;
  glow?: "gold" | "cyan" | "purple" | "green" | "none";
  style?: React.CSSProperties;
};

const glowClasses = {
  gold: "accent-glow-gold",
  cyan: "accent-glow-cyan",
  purple: "accent-glow-purple",
  green: "accent-glow-green",
  none: "",
};

export function Card({ children, className = "", glow = "none", style }: CardProps) {
  return (
    <div
      style={style}
      className={`glass-panel rounded-2xl ${glowClasses[glow]} ${className}`}
    >
      {children}
    </div>
  );
}
