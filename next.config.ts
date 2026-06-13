import type { NextConfig } from "next";

const casinoApiRoutes = [
  "/api/load-player",
  "/api/save-game",
  "/api/collect",
  "/api/confirm-collect",
  "/api/game-stats",
  "/api/leaderboard",
] as const;

const casinoApiIncludes = Object.fromEntries(
  casinoApiRoutes.map((route) => [route, ["./casino-api/**/*"] as string[]]),
);

const nextConfig: NextConfig = {
  outputFileTracingIncludes: casinoApiIncludes,
  serverExternalPackages: ["@neondatabase/serverless"],
};

export default nextConfig;
