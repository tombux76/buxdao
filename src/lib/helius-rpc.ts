const HELIUS_RPC = "https://mainnet.helius-rpc.com";
const HELIUS_API = "https://api.helius.xyz";

const BLACKLIST_TTL_MS = 10 * 60 * 1000;

/** Keys that recently hit quota / auth errors — skipped until TTL expires. */
const keyBlacklist = new Map<string, number>();

function isKeyBlacklisted(apiKey: string): boolean {
  const until = keyBlacklist.get(apiKey);
  if (until == null) {
    return false;
  }
  if (Date.now() >= until) {
    keyBlacklist.delete(apiKey);
    return false;
  }
  return true;
}

function blacklistKey(apiKey: string): void {
  keyBlacklist.set(apiKey, Date.now() + BLACKLIST_TTL_MS);
}

/** Collect configured Helius keys (primary + numbered HELIUS_API_KEY_2…_10, optional extras). */
export function getHeliusApiKeys(): string[] {
  const keys: string[] = [];
  const add = (value: string | undefined) => {
    const trimmed = value?.trim();
    if (trimmed && !keys.includes(trimmed)) {
      keys.push(trimmed);
    }
  };

  add(process.env.HELIUS_API_KEY);
  for (let i = 2; i <= 10; i += 1) {
    add(process.env[`HELIUS_API_KEY_${i}`]);
  }

  const extras = process.env.HELIUS_API_KEYS?.split(",") ?? [];
  for (const entry of extras) {
    add(entry);
  }

  return keys;
}

/**
 * Prefer the primary HELIUS_API_KEY first (the one operators rotate when capped),
 * then rotate only among numbered/extra keys by calendar month.
 */
export function getOrderedHeliusApiKeys(): string[] {
  const keys = getHeliusApiKeys();
  if (keys.length <= 1) {
    return keys;
  }

  const primary = keys[0]!;
  const rest = keys.slice(1);
  if (rest.length <= 1) {
    return keys;
  }

  const monthOffset = new Date().getUTCMonth() % rest.length;
  const orderedRest =
    monthOffset === 0 ? rest : [...rest.slice(monthOffset), ...rest.slice(0, monthOffset)];

  return [primary, ...orderedRest];
}

/** Ordered keys with recently-exhausted ones pushed to the end. */
function getUsableHeliusApiKeys(): string[] {
  const ordered = getOrderedHeliusApiKeys();
  const ready: string[] = [];
  const blocked: string[] = [];
  for (const key of ordered) {
    if (isKeyBlacklisted(key)) {
      blocked.push(key);
    } else {
      ready.push(key);
    }
  }
  // If everything is blacklisted, still try (quota may have reset / isolate cold).
  return ready.length > 0 ? [...ready, ...blocked] : ordered;
}

export function hasHeliusApiKey(): boolean {
  return getHeliusApiKeys().length > 0;
}

export function getHeliusRpcUrl(apiKey?: string): string {
  const key = apiKey ?? getOrderedHeliusApiKeys()[0];
  if (!key) {
    throw new Error("HELIUS_API_KEY is not configured");
  }
  return `${HELIUS_RPC}/?api-key=${encodeURIComponent(key)}`;
}

export function getHeliusRpcUrlCandidates(): string[] {
  return getUsableHeliusApiKeys().map((key) => getHeliusRpcUrl(key));
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
    lower.includes("max usage") ||
    lower.includes("too many requests")
  );
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
        blacklistKey(apiKey);
      }
      throw error;
    }

    if (payload.error) {
      const message = payload.error.message ?? "Helius RPC error";
      const error = new HeliusRpcError(message, payload.error.code);
      if (shouldFailoverMessage(message)) {
        error.failover = true;
        blacklistKey(apiKey);
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

/** JSON-RPC against mainnet.helius-rpc.com with primary-first order, round-robin backups, and failover. */
export async function heliusRpc<T>(
  method: string,
  params: unknown,
  options: HeliusRpcOptions = {},
): Promise<T | null> {
  const keys = getUsableHeliusApiKeys();
  if (keys.length === 0) {
    if (options.softFail) {
      return null;
    }
    throw new Error("HELIUS_API_KEY is not configured");
  }

  const start = 0;
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
  const keys = getUsableHeliusApiKeys();
  if (keys.length === 0) {
    if (options.softFail) {
      return new Response(null, { status: 503 });
    }
    throw new Error("HELIUS_API_KEY is not configured");
  }

  const base = (options.baseUrl ?? HELIUS_API).replace(/\/+$/, "");
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < keys.length; attempt += 1) {
    const apiKey = keys[attempt]!;
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
        blacklistKey(apiKey);
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
