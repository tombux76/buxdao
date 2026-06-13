"use client";

import { useRouter, useSearchParams } from "next/navigation";

const errorMessages: Record<string, string> = {
  discord_required: "Log in with Discord before linking X.",
  x_already_linked: "X is already linked to your account.",
  AccessDenied: "X linking was cancelled or denied.",
  OAuthAccountNotLinked: "Could not link X to your account.",
};

export function HubAuthErrors() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const error = searchParams.get("error");
  const message = error ? errorMessages[error] ?? "Something went wrong linking X." : null;

  if (!message) {
    return null;
  }

  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
      <p>{message}</p>
      <button
        type="button"
        onClick={() => router.replace("/hub")}
        className="shrink-0 text-xs text-red-200 underline-offset-2 hover:underline"
      >
        Dismiss
      </button>
    </div>
  );
}
