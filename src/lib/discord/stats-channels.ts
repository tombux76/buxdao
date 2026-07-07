import { fetchTokenMetrics } from "@/lib/bux/metrics";

const DISCORD_API = "https://discord.com/api/v10";

export type StatsChannelConfig = {
  walletChannelId: string;
  supplyChannelId: string;
  valueChannelId: string;
};

export type StatsChannelSyncResult = {
  wallet: ChannelUpdateResult;
  supply: ChannelUpdateResult;
  value: ChannelUpdateResult;
  metrics: {
    walletBalanceSol: number;
    publicSupply: number;
    tokenValue: number;
  } | null;
};

type ChannelUpdateResult = {
  channelId: string;
  name: string | null;
  updated: boolean;
  skipped: boolean;
  error: string | null;
};

function getBotToken(): string {
  return process.env.DISCORD_BOT_TOKEN?.trim() ?? "";
}

export function getStatsChannelConfig(): StatsChannelConfig | null {
  const walletChannelId = process.env.DISCORD_STATS_WALLET_CHANNEL_ID?.trim() ?? "";
  const supplyChannelId = process.env.DISCORD_STATS_SUPPLY_CHANNEL_ID?.trim() ?? "";
  const valueChannelId = process.env.DISCORD_STATS_VALUE_CHANNEL_ID?.trim() ?? "";

  if (!walletChannelId && !supplyChannelId && !valueChannelId) {
    return null;
  }

  return { walletChannelId, supplyChannelId, valueChannelId };
}

function formatSolBalance(value: number): string {
  if (value >= 100) {
    return value.toFixed(1);
  }
  if (value >= 10) {
    return value.toFixed(2);
  }
  return value.toFixed(2);
}

function formatBuxSupply(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`;
  }
  if (value >= 10_000) {
    return `${(value / 1_000).toFixed(1)}k`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(2)}k`;
  }
  return Math.round(value).toLocaleString("en-US");
}

function formatTokenValue(value: number): string {
  if (value >= 0.01) {
    return value.toFixed(4);
  }
  if (value >= 0.001) {
    return value.toFixed(5);
  }
  return value.toFixed(6);
}

export function buildStatsChannelNames(metrics: {
  walletBalanceSol: number;
  publicSupply: number;
  tokenValue: number;
}): {
  wallet: string;
  supply: string;
  value: string;
} {
  return {
    wallet: `Liquidity · ${formatSolBalance(metrics.walletBalanceSol)} SOL`,
    supply: `Public supply · ${formatBuxSupply(metrics.publicSupply)} $BUX`,
    value: `Token value · ${formatTokenValue(metrics.tokenValue)} SOL`,
  };
}

async function fetchChannelName(channelId: string, token: string): Promise<string | null> {
  const response = await fetch(`${DISCORD_API}/channels/${channelId}`, {
    headers: { Authorization: `Bot ${token}` },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Failed to read channel ${channelId} (${response.status}): ${body.slice(0, 200)}`);
  }

  const data = (await response.json()) as { name?: string };
  return data.name ?? null;
}

async function patchChannelName(
  channelId: string,
  name: string,
  token: string,
): Promise<void> {
  const response = await fetch(`${DISCORD_API}/channels/${channelId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name }),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Failed to update channel ${channelId} (${response.status}): ${body.slice(0, 200)}`);
  }
}

async function updateChannelIfNeeded(
  channelId: string,
  nextName: string,
  token: string,
): Promise<ChannelUpdateResult> {
  if (!channelId) {
    return { channelId, name: null, updated: false, skipped: true, error: "Channel ID not configured" };
  }

  try {
    const currentName = await fetchChannelName(channelId, token);
    if (currentName === nextName) {
      return { channelId, name: nextName, updated: false, skipped: true, error: null };
    }

    await patchChannelName(channelId, nextName, token);
    return { channelId, name: nextName, updated: true, skipped: false, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Channel update failed";
    return { channelId, name: nextName, updated: false, skipped: false, error: message };
  }
}

export async function syncDiscordStatsChannels(): Promise<StatsChannelSyncResult> {
  const token = getBotToken();
  const config = getStatsChannelConfig();

  if (!token) {
    throw new Error("DISCORD_BOT_TOKEN is not configured");
  }
  if (!config) {
    throw new Error(
      "No stats channel IDs configured (DISCORD_STATS_WALLET_CHANNEL_ID, DISCORD_STATS_SUPPLY_CHANNEL_ID, DISCORD_STATS_VALUE_CHANNEL_ID)",
    );
  }

  const metrics = await fetchTokenMetrics();
  if (!metrics) {
    throw new Error("Token metrics unavailable");
  }

  const names = buildStatsChannelNames({
    walletBalanceSol: metrics.walletBalanceSol,
    publicSupply: metrics.publicSupply,
    tokenValue: metrics.tokenValue,
  });

  const [wallet, supply, value] = await Promise.all([
    updateChannelIfNeeded(config.walletChannelId, names.wallet, token),
    updateChannelIfNeeded(config.supplyChannelId, names.supply, token),
    updateChannelIfNeeded(config.valueChannelId, names.value, token),
  ]);

  return {
    wallet,
    supply,
    value,
    metrics: {
      walletBalanceSol: metrics.walletBalanceSol,
      publicSupply: metrics.publicSupply,
      tokenValue: metrics.tokenValue,
    },
  };
}
