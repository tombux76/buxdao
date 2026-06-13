"use client";

import { useCallback, useEffect, useState } from "react";
import { useDiscordSession } from "@/hooks/useDiscordSession";
import type { HubDiscordRole } from "@/lib/hub/discord-roles";

export function useHubRoles() {
  const { discordConnected } = useDiscordSession();
  const [roles, setRoles] = useState<HubDiscordRole[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!discordConnected) {
      setRoles([]);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/hub/roles");
      if (!response.ok) {
        setRoles([]);
        return;
      }
      const data = (await response.json()) as { roles: HubDiscordRole[] };
      setRoles(data.roles ?? []);
    } catch {
      setRoles([]);
    } finally {
      setLoading(false);
    }
  }, [discordConnected]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { roles, loading, refresh };
}
