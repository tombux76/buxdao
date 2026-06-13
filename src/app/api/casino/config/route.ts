import { tokenConfig } from "@/content/site";
import { getCasinoRpcUrl } from "@/lib/casino/bux-balance";

export const dynamic = "force-dynamic";

export async function GET() {
  const rpc = getCasinoRpcUrl();
  const mint = process.env.BUX_TOKEN_MINT?.trim() || tokenConfig.mint;
  const treasury = process.env.TREASURY_WALLET?.trim() || "";
  const decimals = Number.parseInt(process.env.BUX_TOKEN_DECIMALS ?? "9", 10);

  const body = `(function () {
  window.__SLOTS_TOKEN__ = "bux";
  window.__COINFLIP_TOKEN__ = "bux";
  window.__ROULETTE_TOKEN__ = "bux";
  window.__BUX_CASINO_RPC__ = ${JSON.stringify(rpc)};
  window.__BUX_TOKEN_MINT__ = ${JSON.stringify(mint)};
  window.__TREASURY_WALLET__ = ${JSON.stringify(treasury)};
  window.__BUX_DECIMALS__ = ${decimals};
})();`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
