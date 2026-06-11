type SectionHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
};

export function SectionHeader({ eyebrow, title, description }: SectionHeaderProps) {
  return (
    <div className="mb-8">
      {eyebrow && (
        <p className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-accent-cyan">
          {eyebrow}
        </p>
      )}
      <h2 className="text-2xl font-semibold text-foreground md:text-3xl">{title}</h2>
      {description && <p className="mt-2 max-w-2xl text-muted">{description}</p>}
    </div>
  );
}
