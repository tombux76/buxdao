import type { Metadata } from "next";
import { site } from "@/content/site";

const DEFAULT_OG_IMAGE = "/og/default.png";

/** Builds Open Graph + Twitter card metadata for a page (link previews). */
export function buildPageMetadata(params: {
  title: string;
  description: string;
  path: string;
  image?: string;
}): Metadata {
  const image = params.image ?? DEFAULT_OG_IMAGE;
  const fullTitle = `${params.title} · ${site.name}`;

  return {
    title: params.title,
    description: params.description,
    alternates: { canonical: params.path },
    openGraph: {
      type: "website",
      siteName: site.name,
      title: fullTitle,
      description: params.description,
      url: params.path,
      images: [{ url: image, alt: fullTitle }],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description: params.description,
      images: [image],
    },
  };
}
