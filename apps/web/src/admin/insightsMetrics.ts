/** Gauge fields that existed as `backlog` before the due/in-flight rename. */
export type StepDueFields = {
  due?: number;
  backlog?: number;
};

/**
 * Due listings for an enrichment step.
 * Prefer `due`; fall back to `backlog` so Insights survives mixed API/web deploys
 * after the JSON rename (Sentry MTB-AGGREGATOR-WEB-J).
 */
export function stepDueCount(step: StepDueFields): number | undefined {
  if (typeof step.due === "number" && Number.isFinite(step.due)) {
    return step.due;
  }
  if (typeof step.backlog === "number" && Number.isFinite(step.backlog)) {
    return step.backlog;
  }
  return undefined;
}

/** Locale-format a count; missing values render as an em dash instead of throwing. */
export function formatCount(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString();
}
