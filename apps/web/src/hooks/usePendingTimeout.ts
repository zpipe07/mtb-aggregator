import { useEffect, useRef, useState } from "react";
import * as Sentry from "@sentry/nextjs";
import posthog from "posthog-js";
import { readLatestDealsRscSample } from "@/lib/dealsTransitionDiagnostics";

export type PendingTimeoutContext = {
  pathname?: string;
  searchParams?: string;
  sort?: string;
  offset?: number;
  /** Count of selected spec values. Low cardinality; raw query stays in context only. */
  specFilterCount?: number;
};

const DEFAULT_TIMEOUT_MS = 15_000;

function currentHref(): string | null {
  if (typeof window === "undefined") return null;
  return window.location.pathname + window.location.search;
}

export function usePendingTimeout(
  isPending: boolean,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  context?: PendingTimeoutContext,
) {
  const [timedOut, setTimedOut] = useState(false);
  const pendingStartedAt = useRef<number | null>(null);
  const reportedRef = useRef(false);
  const hrefAtStartRef = useRef<string | null>(null);
  const contextRef = useRef(context);
  contextRef.current = context;

  useEffect(() => {
    if (!isPending) {
      if (reportedRef.current) {
        const started = pendingStartedAt.current;
        const durationMs = started ? Date.now() - started : timeoutMs;
        const ctx = contextRef.current;
        const hrefNow = currentHref();
        posthog.capture("deals_transition_recovered", {
          duration_ms: durationMs,
          pathname: ctx?.pathname,
          sort: ctx?.sort,
          offset: ctx?.offset,
          spec_filter_count: ctx?.specFilterCount ?? 0,
          url_committed: hrefAtStartRef.current != null && hrefNow !== hrefAtStartRef.current,
        });
        Sentry.addBreadcrumb({
          category: "deals.navigation",
          level: "info",
          message: "Deals transition recovered after timeout",
          data: { duration_ms: durationMs },
        });
      }
      setTimedOut(false);
      pendingStartedAt.current = null;
      reportedRef.current = false;
      hrefAtStartRef.current = null;
      return;
    }

    pendingStartedAt.current = Date.now();
    hrefAtStartRef.current = currentHref();
    setTimedOut(false);
    reportedRef.current = false;

    const timer = window.setTimeout(() => {
      setTimedOut(true);
      if (reportedRef.current) return;
      reportedRef.current = true;

      const ctx = contextRef.current;
      const started = pendingStartedAt.current;
      const durationMs = started ? Date.now() - started : timeoutMs;
      const hrefNow = currentHref();
      const urlCommitted =
        hrefAtStartRef.current != null && hrefNow !== hrefAtStartRef.current;
      const rsc = readLatestDealsRscSample(ctx?.pathname, started ?? Date.now());

      Sentry.withScope((scope) => {
        scope.setTag("surface", "deals_page");
        scope.setTag("failure_mode", "transition_timeout");
        scope.setTag("rsc_response_ended", rsc.responseEnded ? "true" : "false");
        scope.setTag("rsc_matched", rsc.matched ? "true" : "false");
        scope.setTag("url_committed", urlCommitted ? "true" : "false");
        scope.setContext("deals_navigation", {
          pathname: ctx?.pathname,
          search_params: ctx?.searchParams,
          sort: ctx?.sort,
          offset: ctx?.offset,
          spec_filter_count: ctx?.specFilterCount ?? 0,
          duration_ms: durationMs,
          rsc_duration_ms: rsc.durationMs,
          rsc_response_ended: rsc.responseEnded,
          rsc_matched: rsc.matched,
          url_committed: urlCommitted,
        });
        Sentry.captureMessage("Deals transition timed out", "warning");
      });

      posthog.capture("deals_transition_timeout", {
        duration_ms: durationMs,
        pathname: ctx?.pathname,
        search_params: ctx?.searchParams,
        sort: ctx?.sort,
        offset: ctx?.offset,
        spec_filter_count: ctx?.specFilterCount ?? 0,
        rsc_response_ended: rsc.responseEnded,
        rsc_matched: rsc.matched,
        rsc_duration_ms: rsc.durationMs,
        url_committed: urlCommitted,
      });
    }, timeoutMs);

    return () => window.clearTimeout(timer);
  }, [isPending, timeoutMs]);

  const effectivePending = isPending && !timedOut;

  const clearTimeoutState = () => setTimedOut(false);

  return {
    isPending: effectivePending,
    timedOut,
    clearTimeoutState,
  };
}
