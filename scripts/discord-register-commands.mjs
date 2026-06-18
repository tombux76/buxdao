/**
 * Register global Discord slash commands (replaces all existing global commands).
 *
 * Usage:
 *   node scripts/discord-register-commands.mjs
 *   node scripts/discord-register-commands.mjs --dry-run
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

const dryRun = process.argv.includes("--dry-run");
const appId = process.env.AUTH_DISCORD_ID;
const token = process.env.DISCORD_BOT_TOKEN;

if (!appId || !token) {
  console.error("AUTH_DISCORD_ID and DISCORD_BOT_TOKEN are required");
  process.exit(1);
}

const commandsPath = join(process.cwd(), "data/discord/slash-commands.json");
const commands = JSON.parse(readFileSync(commandsPath, "utf8"));

if (dryRun) {
  console.log(JSON.stringify(commands, null, 2));
  process.exit(0);
}

const res = await fetch(`https://discord.com/api/v10/applications/${appId}/commands`, {
  method: "PUT",
  headers: {
    Authorization: `Bot ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(commands),
});

const text = await res.text();
if (!res.ok) {
  console.error(`Registration failed (${res.status}):`, text);
  process.exit(1);
}

const registered = JSON.parse(text);
console.log(`Registered ${registered.length} global commands:`);
for (const cmd of registered) {
  console.log(`  /${cmd.name}`);
}
