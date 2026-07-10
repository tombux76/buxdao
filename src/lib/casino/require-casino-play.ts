import { auth } from "@/auth";
import { isWalletLinkedToUser } from "@/lib/holder-rewards/wallet-auth";

export type CasinoPlayGuard =
  | { ok: true; userId: string }
  | { ok: false; status: number; error: string };

export async function requireCasinoPlay(walletAddress: string): Promise<CasinoPlayGuard> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, status: 401, error: "Discord login required to play casino games" };
  }

  const linked = await isWalletLinkedToUser(session.user.id, walletAddress);
  if (!linked) {
    return {
      ok: false,
      status: 403,
      error: "Link this wallet in Holder Hub before playing",
    };
  }

  return { ok: true, userId: session.user.id };
}

export function getWalletFromCasinoBody(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const wallet = record.walletAddress ?? record.userWallet;
  return typeof wallet === "string" ? wallet : null;
}
