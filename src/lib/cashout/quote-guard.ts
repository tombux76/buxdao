import {
  MAX_CASHOUT_SOL_NET,
  WHALE_REQUIRED_ABOVE_SOL_NET,
  buxRawToNumber,
} from "@/lib/cashout/config";
import {
  getCashoutFeeBps,
  quoteCashoutSol,
  userHasWhaleRole,
} from "@/lib/cashout/eligibility";
import { fetchTokenMetrics } from "@/lib/bux/metrics";

export type PendingQuoteRow = {
  bux_amount_raw: string;
  sol_net_lamports: string;
  token_value_snapshot: string;
  fee_bps: number;
};

/** Ensure a locked quote is still fair at current token value and fee tier. */
export async function assertQuoteStillValid(userId: string, row: PendingQuoteRow): Promise<void> {
  const [metrics, currentFeeBps, hasWhaleRole] = await Promise.all([
    fetchTokenMetrics(),
    getCashoutFeeBps(userId),
    userHasWhaleRole(userId),
  ]);

  const tokenValue = metrics?.tokenValue ?? 0;
  if (tokenValue <= 0) {
    throw new Error("Token value unavailable — try again shortly");
  }

  if (row.fee_bps < currentFeeBps) {
    throw new Error("Your fee tier changed — start a new cashout from the Hub");
  }

  const amountBux = buxRawToNumber(BigInt(row.bux_amount_raw));
  const fairQuote = quoteCashoutSol({
    buxAmount: amountBux,
    tokenValue,
    feeBps: row.fee_bps,
  });

  const snapshotNet = BigInt(row.sol_net_lamports);
  if (snapshotNet > fairQuote.solNetLamports + BigInt(1)) {
    throw new Error("Token rate changed — start a new cashout from the Hub");
  }

  const solNet = Number(snapshotNet) / 1e9;
  if (solNet > MAX_CASHOUT_SOL_NET + 1e-9) {
    throw new Error(`Maximum cashout is ${MAX_CASHOUT_SOL_NET} SOL (after fees).`);
  }
  if (solNet > WHALE_REQUIRED_ABOVE_SOL_NET + 1e-9 && !hasWhaleRole) {
    throw new Error(
      `Cashouts above ${WHALE_REQUIRED_ABOVE_SOL_NET} SOL require a whale role in at least one collection.`,
    );
  }
}

/** Re-validate a processing-row payout against the current token rate and fee tier. */
export async function assertProcessingPayoutStillFair(
  userId: string,
  buxAmountRaw: string,
  solNetLamports: string,
): Promise<void> {
  const [metrics, currentFeeBps] = await Promise.all([
    fetchTokenMetrics(),
    getCashoutFeeBps(userId),
  ]);

  const tokenValue = metrics?.tokenValue ?? 0;
  if (tokenValue <= 0) {
    throw new Error("Token value unavailable — try again shortly");
  }

  const amountBux = buxRawToNumber(BigInt(buxAmountRaw));
  const fairQuote = quoteCashoutSol({
    buxAmount: amountBux,
    tokenValue,
    feeBps: currentFeeBps,
  });

  if (BigInt(solNetLamports) > fairQuote.solNetLamports + BigInt(1)) {
    throw new Error("Token rate changed — contact support with your $BUX transaction");
  }
}
