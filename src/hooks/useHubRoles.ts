"use client";

import { useCallback, useEffect, useState } from "react";
import { useDiscordSession } from "@/hooks/useDiscordSession";
import type { HubDiscordRole } from "@/lib/hub/discord-roles";

export function useHubRoles() {
  const { discordConnected } = useDiscordSession();
  const [roles, setRoles] = useState<HubDiscordRole[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!discordConnected) {
      setRoles([]);
      setError(null);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/hub/roles");
      if (!response.ok) {
        setRoles([]);
        setError("Failed to load roles");
        return;
      }
      const data = (await response.json()) as { roles: HubDiscordRole[]; error?: string };
      setRoles(data.roles ?? []);
      setError(data.error ?? null);
    } catch {
      setRoles([]);
      setError("Failed to load roles");
    } finally {
      setLoading(false);
    }
  }, [discordConnected]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { roles, loading, error, refresh };
}
