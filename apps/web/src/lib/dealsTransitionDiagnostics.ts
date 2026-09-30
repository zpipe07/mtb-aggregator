export type DealsRscSample = {
  /** An `_rsc` fetch for this pathname started with the pending navigation. */
  matched: boolean;
  /** Response body finished (headers-only 200s stay false while the stream is open). */
  responseEnded: boolean;
  durationMs: number | null;
  /** Epoch ms when the body finished. Null while the stream is open or unmatched. */
  responseEndedAtMs: number | null;
};

const EMPTY_SAMPLE: DealsRscSample = {
  matched: false,
  responseEnded: false,
  durationMs: null,
  responseEndedAtMs: null,
};

const RETAINED_RSC_ENTRIES = 40;
const retainedRsc: PerformanceResourceTiming[] = [];
let rscObserverStarted = false;

/** Keep recent `_rsc` entries even after the Resource Timing buffer drops them. */
export function rememberObservedRsc(entry: PerformanceResourceTiming): void {
  if (!entry.name.includes("_rsc=")) return;
  retainedRsc.push(entry);
  if (retainedRsc.length > RETAINED_RSC_ENTRIES) retainedRsc.shift();
}

export function resetObservedRscEntries(): void {
  retainedRsc.length = 0;
}

/** Start a buffered PerformanceObserver once. Safe to call on every pending transition. */
export function observeDealsRscFetches(): void {
  if (rscObserverStarted || typeof PerformanceObserver === "undefined") return;
  rscObserverStarted = true;
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        rememberObservedRsc(entry as PerformanceResourceTiming);
      }
    });
    observer.observe({ type: "resource", buffered: true });
  } catch {
    rscObserverStarted = false;
  }
}

function entriesForSample(live: PerformanceEntry[]): PerformanceEntry[] {
  if (retainedRsc.length === 0) return live;
  const seen = new Set<string>();
  const merged: PerformanceEntry[] = [];
  for (const entry of [...live, ...retainedRsc]) {
    const key = `${entry.name}\0${entry.startTime}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(entry);
  }
  merged.sort((a, b) => a.startTime - b.startTime);
  return merged;
}

/**
 * Latest soft-nav RSC fetch for `pathname` that started at or after the
 * pending transition. Older completed fetches for the same path are ignored
 * so an in-flight request is not mistaken for a finished one.
 */
export function latestDealsRscSample(
  pathname: string | undefined,
  pendingStartedAtMs: number,
  entries: PerformanceEntry[],
  timeOrigin: number,
): DealsRscSample {
  if (!pathname) return EMPTY_SAMPLE;

  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i] as PerformanceResourceTiming;
    if (entry.initiatorType && entry.initiatorType !== "fetch") continue;

    let url: URL;
    try {
      url = new URL(entry.name);
    } catch {
      continue;
    }
    if (url.pathname !== pathname || !url.searchParams.has("_rsc")) continue;

    const startedAt = timeOrigin + entry.startTime;
    // Effect records pending a few ms around the click; allow a small skew.
    if (startedAt + 250 < pendingStartedAtMs) continue;

    const responseEnded = entry.responseEnd > 0;
    return {
      matched: true,
      responseEnded,
      durationMs: Math.round(entry.duration),
      responseEndedAtMs: responseEnded ? Math.round(timeOrigin + entry.responseEnd) : null,
    };
  }

  return EMPTY_SAMPLE;
}

export function readLatestDealsRscSample(
  pathname: string | undefined,
  pendingStartedAtMs: number,
): DealsRscSample {
  if (typeof performance === "undefined" || !performance.getEntriesByType) {
    return EMPTY_SAMPLE;
  }
  try {
    return latestDealsRscSample(
      pathname,
      pendingStartedAtMs,
      entriesForSample(performance.getEntriesByType("resource")),
      performance.timeOrigin,
    );
  } catch {
    return EMPTY_SAMPLE;
  }
}
