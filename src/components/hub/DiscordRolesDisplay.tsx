import type { HubDiscordRole } from "@/lib/hub/discord-roles";

type DiscordRolesDisplayProps = {
  roles: HubDiscordRole[];
  loading?: boolean;
};

export function DiscordRolesDisplay({ roles, loading = false }: DiscordRolesDisplayProps) {
  return (
    <div>
      <p className="mb-3 flex items-center gap-2 text-xs uppercase text-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/discord.svg" alt="" className="h-4 w-4" />
        Discord roles
      </p>

      {loading ? (
        <p className="text-sm text-muted">Loading roles…</p>
      ) : roles.length === 0 ? (
        <div className="text-sm text-muted">
          <p>Verify in Discord to receive holder roles.</p>
          <p className="mt-1 text-xs">Connect your wallet, then use the verify button in our Discord server.</p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {roles.map((role) => (
            <div
              key={role.id}
              className="inline-flex items-center rounded-lg bg-bg-surface/80 px-2 py-1 transition hover:bg-bg-surface"
            >
              {role.emoji_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={role.emoji_url.startsWith("/") ? encodeURI(role.emoji_url) : role.emoji_url}
                  alt=""
                  className="mr-1.5 h-4 w-4 shrink-0 object-contain"
                />
              ) : null}
              <span
                className="mr-2 h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: role.color }}
              />
              <span className="text-sm font-medium" style={{ color: role.color }}>
                {role.display_name}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
