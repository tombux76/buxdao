import { Footer } from "./Footer";
import { Header } from "./Header";
import { MobileNav } from "./MobileNav";
import { Sidebar } from "./Sidebar";
import { Ticker } from "./Ticker";

type AppShellProps = {
  children: React.ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-dvh">
      <Sidebar />
      <Header />
      <div className="lg:pl-[var(--sidebar-width)]">
        <Ticker />
        <main className="grid-bg min-h-[calc(100dvh-var(--header-height)-40px-var(--bottom-nav-height))] px-4 py-8 pb-24 lg:pb-8 lg:px-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
      <Footer />
      <MobileNav />
    </div>
  );
}
