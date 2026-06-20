export type APIEmbed = {
  title?: string;
  description?: string;
  color?: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  image?: { url: string };
  thumbnail?: { url: string };
  footer?: { text: string };
  url?: string;
};

export function shortWallet(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export function formatBux(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function formatSol(value: number): string {
  if (value < 0.01) {
    return value.toFixed(4);
  }
  return value.toFixed(2);
}

export function solscanNftUrl(mint: string): string {
  return `https://solscan.io/token/${mint}`;
}

export function solscanWalletUrl(wallet: string): string {
  return `https://solscan.io/account/${wallet}`;
}

export function solscanTxUrl(signature: string): string {
  return `https://solscan.io/tx/${signature}`;
}

export function graveMarketNftUrl(mint: string): string {
  return `https://gravemarket.io/nft/${mint}`;
}

export function hubLink(): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://www.buxdao.com";
  return `${base.replace(/\/$/, "")}/hub`;
}

export function absoluteSiteUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://www.buxdao.com";
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${base.replace(/\/$/, "")}${normalized}`;
}

export function collectionGifUrl(gifPath: string): string {
  return absoluteSiteUrl(gifPath);
}

export function collectionLogoUrl(logoPath: string): string {
  return absoluteSiteUrl(logoPath);
}

export function hexColorToEmbed(hex: string): number {
  const cleaned = hex.replace("#", "");
  return Number.parseInt(cleaned, 16);
}
