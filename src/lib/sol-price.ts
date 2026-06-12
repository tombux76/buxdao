const CACHE_TTL_MS = 5 * 60 * 1000;

let cachedPrice: number | null = null;
let cachedAt = 0;

export async function getSolPrice(): Promise<number | null> {
  if (cachedPrice && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedPrice;
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
        { next: { revalidate: 300 } },
      );

      if (!response.ok) {
        if (response.status === 429) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
          continue;
        }
        throw new Error(`Failed to fetch SOL price: ${response.statusText}`);
      }

      const data = (await response.json()) as { solana?: { usd?: number } };
      const price = Number(data.solana?.usd);
      if (!Number.isFinite(price) || price <= 0) {
        throw new Error("Invalid SOL price data");
      }

      cachedPrice = price;
      cachedAt = Date.now();
      return price;
    } catch {
      if (attempt === 2 && cachedPrice) {
        return cachedPrice;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }

  return cachedPrice;
}
