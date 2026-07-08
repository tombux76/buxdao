import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPageMetadata } from "@/lib/seo";
import { pageMeta } from "@/content/site";

export const metadata: Metadata = buildPageMetadata({ ...pageMeta.bux, path: "/bux" });

export default function BuxLayout({ children }: { children: ReactNode }) {
  return children;
}
