export type DealsRscSample = {
  /** An `_rsc` fetch for this pathname started with the pending navigation. */
  matched: boolean;
  /** Response body finished (headers-only 200s stay false while the stream is open). */
  responseEnded: boolean;
  durationMs: number | null;
};

const EMPTY_SAMPLE: DealsRscSample = {
  matched: false,
  responseEnded: false,
  durationMs: null,
};

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

    return {
      matched: true,
      responseEnded: entry.responseEnd > 0,
      durationMs: Math.round(entry.duration),
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
      performance.getEntriesByType("resource"),
      performance.timeOrigin,
    );
  } catch {
    return EMPTY_SAMPLE;
  }
}
