import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import { Space_Grotesk, Syne } from "next/font/google";
import { AppShell } from "@/components/layout/AppShell";
import { WalletProviders } from "@/components/wallet/WalletProviders";
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

export const metadata: Metadata = {
  title: `${site.name} — ${site.tagline}`,
  description: site.description,
  metadataBase: new URL(site.url),
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
        <WalletProviders>
          <AppShell>{children}</AppShell>
        </WalletProviders>
      </body>
    </html>
  );
}
