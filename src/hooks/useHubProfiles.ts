"use client";

import { useCallback, useEffect, useState } from "react";
import { useDiscordSession } from "@/hooks/useDiscordSession";

export type LinkedTwitter = {
  username: string;
  userId: string;
  image: string | null;
  label: string;
};

export type LinkedDiscord = {
  discordId: string;
  username: string | null;
  image: string | null;
};

type HubProfilesResponse = {
  discord: LinkedDiscord | null;
  twitter: LinkedTwitter | null;
  twitterEnabled: boolean;
};

export function useHubProfiles() {
  const { discordConnected } = useDiscordSession();
  const [discord, setDiscord] = useState<LinkedDiscord | null>(null);
  const [twitter, setTwitter] = useState<LinkedTwitter | null>(null);
  const [twitterEnabled, setTwitterEnabled] = useState(false);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!discordConnected) {
      setDiscord(null);
      setTwitter(null);
      setTwitterEnabled(false);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/hub/social");
      if (!response.ok) {
        return;
      }
      const data = (await response.json()) as HubProfilesResponse;
      setDiscord(data.discord);
      setTwitter(data.twitter);
      setTwitterEnabled(data.twitterEnabled);
    } catch {
      setDiscord(null);
      setTwitter(null);
    } finally {
      setLoading(false);
    }
  }, [discordConnected]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { discord, twitter, twitterEnabled, loading, refresh };
}
