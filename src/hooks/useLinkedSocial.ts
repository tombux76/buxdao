"use client";

import { useCallback, useEffect, useState } from "react";
import { useDiscordSession } from "@/hooks/useDiscordSession";

export type LinkedTwitter = {
  username: string;
  userId: string;
  image: string | null;
};

type SocialResponse = {
  twitterEnabled: boolean;
  twitter: LinkedTwitter | null;
};

export function useLinkedSocial() {
  const { discordConnected } = useDiscordSession();
  const [twitter, setTwitter] = useState<LinkedTwitter | null>(null);
  const [twitterEnabled, setTwitterEnabled] = useState(false);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!discordConnected) {
      setTwitter(null);
      setTwitterEnabled(false);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/hub/social");
      if (!response.ok) {
        setTwitter(null);
        setTwitterEnabled(false);
        return;
      }
      const data = (await response.json()) as SocialResponse;
      setTwitter(data.twitter);
      setTwitterEnabled(data.twitterEnabled);
    } catch {
      setTwitter(null);
      setTwitterEnabled(false);
    } finally {
      setLoading(false);
    }
  }, [discordConnected]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const unlinkTwitter = useCallback(async () => {
    const response = await fetch("/api/hub/social", { method: "DELETE" });
    if (!response.ok) {
      throw new Error("Failed to unlink X");
    }
    setTwitter(null);
  }, []);

  return { twitter, twitterEnabled, loading, refresh, unlinkTwitter };
}
