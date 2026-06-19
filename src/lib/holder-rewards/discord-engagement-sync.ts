import {
  countMessageCreditsToday,
  creditRewardAccount,
  getLastMessageCreditAt,
} from "@/lib/holder-rewards/credits";
import {
  DISCORD_ANNOUNCEMENTS_CHANNEL_ID,
  DISCORD_MAX_MESSAGES_PER_DAY,
  DISCORD_MESSAGE_BUX,
  DISCORD_MESSAGE_COOLDOWN_MS,
  DISCORD_MIN_MESSAGE_LENGTH,
  DISCORD_REACTION_BUX,
  getDiscordBotToken,
  getDiscordGuildId,
} from "@/lib/holder-rewards/discord-engagement-config";
import { getRewardDateEt, toEtDateString } from "@/lib/holder-rewards/dates";
import { getHubUserIdByDiscordId } from "@/lib/holder-rewards/users";
import { getPool } from "@/lib/db";

type DiscordChannel = { id: string; type: number; name?: string };
type DiscordMessage = {
  id: string;
  channel_id: string;
  content?: string;
  timestamp: string;
  author?: { id: string; bot?: boolean; username?: string };
  reactions?: { emoji: { id: string | null; name: string }; count: number }[];
};
type DiscordUser = { id: string; username?: string; bot?: boolean };

export type DiscordEngagementSyncResult = {
  channelsScanned: number;
  messagesProcessed: number;
  messagesCredited: number;
  reactionsCredited: number;
  skipped: number;
  errors: string[];
};

const TEXT_CHANNEL_TYPES = new Set([0, 5, 15]);

async function discordFetch<T>(path: string): Promise<T> {
  const token = getDiscordBotToken();
  if (!token) {
    throw new Error("DISCORD_BOT_TOKEN is not configured");
  }

  const response = await fetch(`https://discord.com/api/v10${path}`, {
    headers: { Authorization: `Bot ${token}` },
    cache: "no-store",
  });

  if (response.status === 429) {
    const retry = response.headers.get("retry-after");
    throw new Error(`Discord rate limited (retry after ${retry ?? "?"}s)`);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Discord API ${response.status}: ${body.slice(0, 200)}`);
  }

  return response.json() as Promise<T>;
}

async function getSyncState(key: string): Promise<string | null> {
  const { rows } = await getPool().query<{ value: string }>(
    `SELECT value FROM discord_engagement_sync_state WHERE key = $1`,
    [key],
  );
  return rows[0]?.value ?? null;
}

async function setSyncState(key: string, value: string): Promise<void> {
  await getPool().query(
    `INSERT INTO discord_engagement_sync_state (key, value, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, value],
  );
}

function encodeReactionEmoji(emoji: { id: string | null; name: string }): string {
  if (emoji.id) {
    return encodeURIComponent(`${emoji.name}:${emoji.id}`);
  }
  return encodeURIComponent(emoji.name);
}

async function listGuildTextChannels(guildId: string): Promise<DiscordChannel[]> {
  const channels = await discordFetch<DiscordChannel[]>(`/guilds/${guildId}/channels`);
  return channels.filter((c) => TEXT_CHANNEL_TYPES.has(c.type));
}

async function fetchMessagesAfter(channelId: string, afterId: string | null): Promise<DiscordMessage[]> {
  const query = afterId ? `?after=${afterId}&limit=100` : "?limit=1";
  const messages = await discordFetch<DiscordMessage[]>(`/channels/${channelId}/messages${query}`);
  return messages.sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
}

async function fetchReactionUsers(
  channelId: string,
  messageId: string,
  emoji: { id: string | null; name: string },
): Promise<DiscordUser[]> {
  const encoded = encodeReactionEmoji(emoji);
  const users: DiscordUser[] = [];
  let after: string | undefined;

  for (let page = 0; page < 10; page += 1) {
    const query = after ? `?after=${after}&limit=100` : "?limit=100";
    const batch = await discordFetch<DiscordUser[]>(
      `/channels/${channelId}/messages/${messageId}/reactions/${encoded}/users${query}`,
    );
    users.push(...batch.filter((u) => !u.bot));
    if (batch.length < 100) {
      break;
    }
    after = batch[batch.length - 1]?.id;
  }

  return users;
}

async function tryCreditMessage(message: DiscordMessage): Promise<boolean> {
  const authorId = message.author?.id;
  if (!authorId || message.author?.bot) {
    return false;
  }

  const content = (message.content ?? "").trim();
  if (content.length < DISCORD_MIN_MESSAGE_LENGTH) {
    return false;
  }

  const hubUserId = await getHubUserIdByDiscordId(authorId);
  if (!hubUserId) {
    return false;
  }

  const rewardDateEt = toEtDateString(new Date(message.timestamp));
  const todayCount = await countMessageCreditsToday(hubUserId, rewardDateEt);
  if (todayCount >= DISCORD_MAX_MESSAGES_PER_DAY) {
    return false;
  }

  const lastCreditAt = await getLastMessageCreditAt(hubUserId);
  if (lastCreditAt) {
    const messageAt = new Date(message.timestamp).getTime();
    const lastAt = lastCreditAt.getTime();
    if (messageAt - lastAt < DISCORD_MESSAGE_COOLDOWN_MS) {
      return false;
    }
  }

  const result = await creditRewardAccount({
    userId: hubUserId,
    source: "discord_message",
    amountBux: DISCORD_MESSAGE_BUX,
    rewardDateEt,
    dedupKey: `discord_msg:${message.id}`,
    metadata: {
      channelId: message.channel_id,
      messageId: message.id,
      discordUserId: authorId,
      messageTimestamp: message.timestamp,
    },
  });

  return result.ok && result.credited;
}

async function tryCreditReaction(
  channelId: string,
  messageId: string,
  discordUserId: string,
): Promise<boolean> {
  const hubUserId = await getHubUserIdByDiscordId(discordUserId);
  if (!hubUserId) {
    return false;
  }

  const rewardDateEt = getRewardDateEt();
  const result = await creditRewardAccount({
    userId: hubUserId,
    source: "discord_reaction",
    amountBux: DISCORD_REACTION_BUX,
    rewardDateEt,
    dedupKey: `discord_react:${hubUserId}:${messageId}`,
    metadata: {
      channelId,
      messageId,
      discordUserId,
    },
  });

  return result.ok && result.credited;
}

async function syncChannelMessages(
  channelId: string,
  result: DiscordEngagementSyncResult,
): Promise<void> {
  const stateKey = `channel_cursor:${channelId}`;
  const cursor = await getSyncState(stateKey);

  if (!cursor) {
    const latest = await fetchMessagesAfter(channelId, null);
    if (latest.length > 0) {
      await setSyncState(stateKey, latest[latest.length - 1]!.id);
    }
    return;
  }

  const messages = await fetchMessagesAfter(channelId, cursor);
  if (messages.length === 0) {
    return;
  }

  let newestId = cursor;
  for (const message of messages) {
    result.messagesProcessed += 1;
    if (BigInt(message.id) > BigInt(newestId)) {
      newestId = message.id;
    }

    try {
      const credited = await tryCreditMessage(message);
      if (credited) {
        result.messagesCredited += 1;
      } else {
        result.skipped += 1;
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Message credit failed";
      result.errors.push(`msg ${message.id}: ${msg}`);
    }
  }

  await setSyncState(stateKey, newestId);
}

async function syncAnnouncementReactions(result: DiscordEngagementSyncResult): Promise<void> {
  const channelId = DISCORD_ANNOUNCEMENTS_CHANNEL_ID;
  const messages = await discordFetch<DiscordMessage[]>(`/channels/${channelId}/messages?limit=50`);

  for (const message of messages) {
    if (!message.reactions?.length) {
      continue;
    }

    for (const reaction of message.reactions) {
      if (reaction.count <= 0) {
        continue;
      }

      let users: DiscordUser[];
      try {
        users = await fetchReactionUsers(channelId, message.id, reaction.emoji);
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Reaction fetch failed";
        result.errors.push(`react ${message.id}: ${msg}`);
        continue;
      }

      for (const user of users) {
        try {
          const credited = await tryCreditReaction(channelId, message.id, user.id);
          if (credited) {
            result.reactionsCredited += 1;
          } else {
            result.skipped += 1;
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : "Reaction credit failed";
          result.errors.push(`react ${message.id}/${user.id}: ${msg}`);
        }
      }
    }
  }
}

export async function syncDiscordEngagementRewards(): Promise<DiscordEngagementSyncResult> {
  const guildId = getDiscordGuildId();
  if (!guildId) {
    throw new Error("DISCORD_GUILD_ID is not configured");
  }

  const result: DiscordEngagementSyncResult = {
    channelsScanned: 0,
    messagesProcessed: 0,
    messagesCredited: 0,
    reactionsCredited: 0,
    skipped: 0,
    errors: [],
  };

  const channels = await listGuildTextChannels(guildId);
  result.channelsScanned = channels.length;

  for (const channel of channels) {
    try {
      await syncChannelMessages(channel.id, result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Channel sync failed";
      result.errors.push(`channel ${channel.id}: ${msg}`);
    }
  }

  try {
    await syncAnnouncementReactions(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Announcement sync failed";
    result.errors.push(msg);
  }

  return result;
}
