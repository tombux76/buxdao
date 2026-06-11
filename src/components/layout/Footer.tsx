import { site } from "@/content/site";

export function Footer() {
  return (
    <footer className="relative border-t border-border bg-bg-elevated/60 py-10">
      <div className="absolute left-[50vw] top-1/2 w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 text-center">
        <p className="text-sm font-medium text-foreground">{site.footer.copyright}</p>
        <p className="mt-1 text-xs text-muted">{site.footer.tagline}</p>
      </div>
    </footer>
  );
}
