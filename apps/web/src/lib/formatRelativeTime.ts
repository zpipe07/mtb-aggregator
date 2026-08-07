/** Uppercase relative time for mono stat displays (e.g. "12 MIN AGO"). */
export function formatRelativeTime(
  isoDate: string | null | undefined,
  now = new Date(),
): string {
  if (!isoDate) return "—";

  const then = new Date(isoDate);
  if (Number.isNaN(then.getTime())) return "—";

  const diffSec = Math.max(0, Math.floor((now.getTime() - then.getTime()) / 1000));

  if (diffSec < 60) return "JUST NOW";

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} MIN AGO`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} HR AGO`;

  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay} DAY${diffDay === 1 ? "" : "S"} AGO`;
}
