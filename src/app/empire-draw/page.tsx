import type { Metadata } from "next";
import { PrizeDrawPage } from "@/components/prize-draw/PrizeDrawPage";
import { buildPageMetadata } from "@/lib/seo";
import { pageMeta } from "@/content/site";

export const metadata: Metadata = buildPageMetadata({
  ...pageMeta.empireDraw,
  path: "/empire-draw",
});

export default function Page() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed bottom-0 right-0 top-0 left-0 -z-10 bg-center bg-no-repeat opacity-30 lg:left-[var(--sidebar-width)]"
        style={{
          backgroundImage: "url('/brand/omerta.png')",
          backgroundSize: "auto 100vh",
        }}
      />
      <PrizeDrawPage />
    </>
  );
}
