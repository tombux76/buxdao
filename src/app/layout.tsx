import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import { Space_Grotesk, Syne } from "next/font/google";
import { AppShell } from "@/components/layout/AppShell";
import { AuthSessionProvider } from "@/components/auth/AuthSessionProvider";
import { HubAuthSync } from "@/components/hub/HubAuthSync";
import { WalletProviders } from "@/components/wallet/WalletProviders";
import { LinkedWalletsProvider } from "@/hooks/useLinkedWallets";
import { site } from "@/content/site";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const metadataBaseUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  title: {
    default: `${site.name} — ${site.tagline}`,
    template: `%s · ${site.name}`,
  },
  description: site.description,
  metadataBase: new URL(metadataBaseUrl),
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.png", type: "image/png", sizes: "120x120" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    siteName: site.name,
    title: `${site.name} — ${site.tagline}`,
    description: site.description,
    images: [{ url: "/og/default.png", alt: site.name }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${site.name} — ${site.tagline}`,
    description: site.description,
    images: ["/og/default.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${syne.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full font-sans">
        <AuthSessionProvider>
          <WalletProviders>
            <LinkedWalletsProvider>
              <HubAuthSync />
              <AppShell>{children}</AppShell>
            </LinkedWalletsProvider>
          </WalletProviders>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
