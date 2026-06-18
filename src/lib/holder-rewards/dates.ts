const ET_TIMEZONE = "America/New_York";

/** Calendar date in US Eastern (YYYY-MM-DD). */
export function getRewardDateEt(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ET_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Whole calendar days between two ET dates (end − start). */
export function daysBetweenEtDates(startDateEt: string, endDateEt: string): number {
  const [sy, sm, sd] = startDateEt.split("-").map(Number);
  const [ey, em, ed] = endDateEt.split("-").map(Number);
  const startUtc = Date.UTC(sy, sm - 1, sd);
  const endUtc = Date.UTC(ey, em - 1, ed);
  return Math.max(0, Math.floor((endUtc - startUtc) / 86_400_000));
}

/** ET calendar date for an instant. */
export function toEtDateString(instant: Date): string {
  return getRewardDateEt(instant);
}
