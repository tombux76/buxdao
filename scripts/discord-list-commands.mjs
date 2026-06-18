/**
 * List globally registered Discord slash commands.
 * Usage: node scripts/discord-list-commands.mjs
 */
import { readFileSync } from "node:fs";

function loadEnvFile(path = ".env") {
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // optional
  }
}

loadEnvFile();

const appId = process.env.AUTH_DISCORD_ID;
const token = process.env.DISCORD_BOT_TOKEN;
const guildId = process.env.DISCORD_GUILD_ID;

if (!appId || !token) {
  console.error("AUTH_DISCORD_ID and DISCORD_BOT_TOKEN required");
  process.exit(1);
}

async function get(url) {
  const res = await fetch(url, { headers: { Authorization: `Bot ${token}` } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text}`);
  return JSON.parse(text);
}

const globalCommands = await get(`https://discord.com/api/v10/applications/${appId}/commands`);
console.log("GLOBAL:", JSON.stringify(globalCommands, null, 2));

if (guildId) {
  const guildCommands = await get(
    `https://discord.com/api/v10/applications/${appId}/guilds/${guildId}/commands`,
  );
  console.log("\nGUILD:", JSON.stringify(guildCommands, null, 2));
}
