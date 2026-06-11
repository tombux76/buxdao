const ME_API = "https://api-mainnet.magiceden.dev/v2";
const LAMPORTS_PER_SOL = 1_000_000_000;
const REVALIDATE_SECONDS = 120;

export type MagicEdenStats = {
  symbol?: string;
  floorPrice?: number;
  listedCount?: number;
  volumeAll?: number;
  avgPrice24hr?: number;
};

export type MagicEdenCollection = {
  symbol?: string;
  name?: string;
  totalSupply?: number;
};

async function meFetch<T>(path: string): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(`${ME_API}${path}`, {
      next: { revalidate: REVALIDATE_SECONDS },
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchMagicEdenStats(meSymbol: string): Promise<MagicEdenStats | null> {
  return meFetch<MagicEdenStats>(
    `/collections/${meSymbol}/stats?listingAggMode=true`,
  );
}

export async function fetchMagicEdenCollection(
  meSymbol: string,
): Promise<MagicEdenCollection | null> {
  return meFetch<MagicEdenCollection>(`/collections/${meSymbol}`);
}

export function lamportsToSol(lamports: number): number {
  return lamports / LAMPORTS_PER_SOL;
}

export function formatSol(lamports?: number): string {
  if (lamports === undefined || lamports === null || lamports <= 0) {
    return "— SOL";
  }

  const sol = lamportsToSol(lamports);
  if (sol < 0.01) {
    return `${sol.toFixed(4)} SOL`;
  }

  return `${sol.toFixed(2)} SOL`;
}

export function formatCount(value?: number | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return "—";
  }

  return value.toLocaleString();
}

export function formatPercentListed(listed?: number, supply?: number | null): string {
  if (
    listed === undefined ||
    supply === undefined ||
    supply === null ||
    supply <= 0 ||
    Number.isNaN(listed) ||
    Number.isNaN(supply)
  ) {
    return "—%";
  }

  return `${((listed / supply) * 100).toFixed(1)}%`;
}
