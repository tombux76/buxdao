import { daysBetweenEtDates, toEtDateString } from "@/lib/holder-rewards/dates";

const LOYALTY_CAP = 3;
const LOYALTY_STEP_DAYS = 30;
const LOYALTY_STEP_BONUS = 0.1;

export function loyaltyMultiplierFromHoldStartedAt(
  holdStartedAt: Date | null,
  rewardDateEt: string,
): number {
  if (!holdStartedAt) {
    return 1;
  }

  const startDateEt = toEtDateString(holdStartedAt);
  const daysHeld = daysBetweenEtDates(startDateEt, rewardDateEt);
  const steps = Math.floor(daysHeld / LOYALTY_STEP_DAYS);
  return Math.min(LOYALTY_CAP, 1 + steps * LOYALTY_STEP_BONUS);
}
