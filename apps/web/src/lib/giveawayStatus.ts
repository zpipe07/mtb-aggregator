export const GIVEAWAY_RECENT_ENDED_MS = 30 * 24 * 60 * 60 * 1000;

export type GiveawayKind = "giveaway" | "raffle";
export type GiveawayStatus = "upcoming" | "open" | "ended";

export type GiveawayLike = {
  starts_at?: string | null;
  ends_at: string;
};

export function deriveGiveawayStatus(
  row: GiveawayLike,
  now: Date = new Date(),
): GiveawayStatus {
  const ends = new Date(row.ends_at);
  if (!Number.isNaN(ends.getTime()) && now.getTime() >= ends.getTime()) {
    return "ended";
  }
  if (row.starts_at) {
    const starts = new Date(row.starts_at);
    if (!Number.isNaN(starts.getTime()) && now.getTime() < starts.getTime()) {
      return "upcoming";
    }
  }
  return "open";
}

export function formatGiveawayDate(
  iso: string | null | undefined,
  now: Date = new Date(),
): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    timeZone: "UTC",
  });
}

export function formatTicketPrice(
  amount: number | null | undefined,
  currency = "USD",
): string | null {
  if (amount == null || !(amount > 0)) return null;
  const formatted =
    Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  if (currency === "USD") return `$${formatted}`;
  return `${formatted} ${currency}`;
}
