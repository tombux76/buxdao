const HELIUS_RPC = "https://mainnet.helius-rpc.com";
const HELIUS_API = "https://api.helius.xyz";

let roundRobinIndex = 0;

/** All configured Helius keys (primary, secondary, optional comma-separated extras). */
export function getHeliusApiKeys(): string[] {
  const keys: string[] = [];
  const add = (value: string | undefined) => {
    const trimmed = value?.trim();
    if (trimmed && !keys.includes(trimmed)) {
      keys.push(trimmed);
    }
  };

  add(process.env.HELIUS_API_KEY);
  add(process.env.HELIUS_API_KEY_2);

  const extras = process.env.HELIUS_API_KEYS?.split(",") ?? [];
  for (const entry of extras) {
    add(entry);
  }

  return keys;
}

export function hasHeliusApiKey(): boolean {
  return getHeliusApiKeys().length > 0;
}

export function getHeliusRpcUrl(apiKey?: string): string {
  const key = apiKey ?? getHeliusApiKeys()[0];
  if (!key) {
    throw new Error("HELIUS_API_KEY is not configured");
  }
  return `${HELIUS_RPC}/?api-key=${encodeURIComponent(key)}`;
}

export function getHeliusRpcUrlCandidates(): string[] {
  return getHeliusApiKeys().map((key) => getHeliusRpcUrl(key));
}

export type HeliusRpcOptions = {
  timeoutMs?: number;
  cache?: RequestCache;
  /** When true, return null instead of throwing on failure. */
  softFail?: boolean;
  /** Next.js ISR revalidate (only applied when cache is not "no-store"). */
  nextRevalidate?: number;
};

function shouldFailoverHttp(status: number): boolean {
  return status === 401 || status === 402 || status === 403 || status === 429;
}

function shouldFailoverMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("rate limit") ||
    lower.includes("quota") ||
    lower.includes("credit") ||
    lower.includes("exceeded") ||
    lower.includes("too many requests")
  );
}

function nextKeyStartIndex(keyCount: number): number {
  if (keyCount <= 1) {
    return 0;
  }
  const start = roundRobinIndex % keyCount;
  roundRobinIndex += 1;
  return start;
}

async function heliusRpcWithKey<T>(
  apiKey: string,
  method: string,
  params: unknown,
  options: HeliusRpcOptions,
): Promise<T | null> {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const fetchInit: RequestInit & { next?: { revalidate: number } } = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "1", method, params }),
    signal: controller.signal,
    cache: options.cache ?? "no-store",
  };

  if (options.nextRevalidate != null && fetchInit.cache !== "no-store") {
    fetchInit.next = { revalidate: options.nextRevalidate };
  }

  try {
    const response = await fetch(getHeliusRpcUrl(apiKey), fetchInit);
    const payload = (await response.json()) as {
      result?: T;
      error?: { message?: string; code?: number };
    };

    if (!response.ok) {
      const message = payload.error?.message ?? `Helius RPC failed (${response.status})`;
      const error = new HeliusRpcError(message, response.status);
      if (shouldFailoverHttp(response.status) || shouldFailoverMessage(message)) {
        error.failover = true;
      }
      throw error;
    }

    if (payload.error) {
      const message = payload.error.message ?? "Helius RPC error";
      const error = new HeliusRpcError(message, payload.error.code);
      if (shouldFailoverMessage(message)) {
        error.failover = true;
      }
      throw error;
    }

    return payload.result ?? null;
  } finally {
    clearTimeout(timeout);
  }
}

class HeliusRpcError extends Error {
  failover = false;

  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "HeliusRpcError";
  }
}

/** JSON-RPC against mainnet.helius-rpc.com with round-robin keys and failover on quota/rate limits. */
export async function heliusRpc<T>(
  method: string,
  params: unknown,
  options: HeliusRpcOptions = {},
): Promise<T | null> {
  const keys = getHeliusApiKeys();
  if (keys.length === 0) {
    if (options.softFail) {
      return null;
    }
    throw new Error("HELIUS_API_KEY is not configured");
  }

  const start = nextKeyStartIndex(keys.length);
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < keys.length; attempt += 1) {
    const apiKey = keys[(start + attempt) % keys.length]!;
    try {
      return await heliusRpcWithKey<T>(apiKey, method, params, options);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const failover = error instanceof HeliusRpcError && error.failover;
      if (attempt < keys.length - 1 && failover) {
        continue;
      }
      if (options.softFail) {
        return null;
      }
      throw lastError;
    }
  }

  if (options.softFail) {
    return null;
  }
  throw lastError ?? new Error("Helius RPC failed");
}

export type HeliusRestFetchOptions = {
  baseUrl?: string;
  searchParams?: Record<string, string | undefined>;
  timeoutMs?: number;
  cache?: RequestCache;
  softFail?: boolean;
};

/** REST fetch (api.helius.xyz or webhooks API) with the same key rotation. */
export async function heliusRestFetch(
  path: string,
  init: RequestInit = {},
  options: HeliusRestFetchOptions = {},
): Promise<Response> {
  const keys = getHeliusApiKeys();
  if (keys.length === 0) {
    if (options.softFail) {
      return new Response(null, { status: 503 });
    }
    throw new Error("HELIUS_API_KEY is not configured");
  }

  const base = (options.baseUrl ?? HELIUS_API).replace(/\/+$/, "");
  const start = nextKeyStartIndex(keys.length);
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < keys.length; attempt += 1) {
    const apiKey = keys[(start + attempt) % keys.length]!;
    const url = new URL(`${base}${path.startsWith("/") ? path : `/${path}`}`);
    url.searchParams.set("api-key", apiKey);
    for (const [key, value] of Object.entries(options.searchParams ?? {})) {
      if (value != null) {
        url.searchParams.set(key, value);
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);

    try {
      const response = await fetch(url.toString(), {
        ...init,
        signal: controller.signal,
        cache: options.cache ?? "no-store",
      });

      if (response.ok || attempt >= keys.length - 1) {
        return response;
      }

      if (shouldFailoverHttp(response.status)) {
        continue;
      }

      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < keys.length - 1) {
        continue;
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  if (options.softFail) {
    return new Response(null, { status: 503 });
  }
  throw lastError ?? new Error("Helius REST request failed");
}
