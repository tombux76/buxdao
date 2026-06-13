import { tokenConfig } from "@/content/site";
import { getCasinoRpcUrl } from "@/lib/casino/bux-balance";
import { getCasinoFeeConfig } from "@/lib/casino/fee-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const rpc = getCasinoRpcUrl();
  const mint = process.env.BUX_TOKEN_MINT?.trim() || tokenConfig.mint;
  const decimals = Number.parseInt(process.env.BUX_TOKEN_DECIMALS ?? "9", 10);
  const fees = getCasinoFeeConfig();

  const body = `(function () {
  window.__SLOTS_TOKEN__ = "bux";
  window.__COINFLIP_TOKEN__ = "bux";
  window.__ROULETTE_TOKEN__ = "bux";
  window.__BUX_CASINO_RPC__ = ${JSON.stringify(rpc)};
  window.__BUX_TOKEN_MINT__ = ${JSON.stringify(mint)};
  window.__BUX_DECIMALS__ = ${decimals};
  window.__TREASURY_WALLET__ = ${JSON.stringify(fees.treasuryWallet)};
  window.__PROJECT_WALLET__ = ${JSON.stringify(fees.projectWallet)};
  window.__PURCHASE_FEE_LAMPORTS__ = ${fees.purchaseFeeLamports};
  window.__FEE_TO_PROJECT_LAMPORTS__ = ${fees.feeToProjectLamports};
  window.__FEE_TO_TREASURY_GAS_LAMPORTS__ = ${fees.feeToTreasuryGasLamports};
})();`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
