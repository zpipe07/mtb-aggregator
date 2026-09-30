import { useEffect, useRef, useState } from "react";
import * as Sentry from "@sentry/nextjs";
import posthog from "posthog-js";
import {
  observeDealsRscFetches,
  readLatestDealsRscSample,
} from "@/lib/dealsTransitionDiagnostics";
import {
  armPendingNudge,
  ensureResourceTimingBuffer,
  type PendingNudgeReason,
} from "@/lib/pendingNudge";

export type PendingTimeoutContext = {
  pathname?: string;
  searchParams?: string;
  sort?: string;
  offset?: number;
  /** Count of selected spec values. Low cardinality; raw query stays in context only. */
  specFilterCount?: number;
  /** `beginReplace` calls while this transition was already pending. */
  overlappingNavigations?: number;
};

const DEFAULT_TIMEOUT_MS = 15_000;

function currentHref(): string | null {
  if (typeof window === "undefined") return null;
  return window.location.pathname + window.location.search;
}

function visibilityState(): string {
  if (typeof document === "undefined") return "unknown";
  return document.visibilityState;
}

type TransitionDiagnostics = {
  rsc_matched: boolean;
  rsc_response_ended: boolean;
  rsc_duration_ms: number | null;
  rsc_end_age_ms: number | null;
  overlapping_navigations: number;
  visibility_state: string;
  release: string;
};

function readTransitionDiagnostics(
  ctx: PendingTimeoutContext | undefined,
  pendingStartedAt: number | null,
): TransitionDiagnostics {
  const rsc = readLatestDealsRscSample(ctx?.pathname, pendingStartedAt ?? Date.now());
  return {
    rsc_matched: rsc.matched,
    rsc_response_ended: rsc.responseEnded,
    rsc_duration_ms: rsc.durationMs,
    rsc_end_age_ms: rsc.responseEndedAtMs == null ? null : Date.now() - rsc.responseEndedAtMs,
    overlapping_navigations: ctx?.overlappingNavigations ?? 0,
    visibility_state: visibilityState(),
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE ?? "",
  };
}

export function usePendingTimeout(
  isPending: boolean,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  context?: PendingTimeoutContext,
) {
  const [timedOut, setTimedOut] = useState(false);
  const [, setNudgeEpoch] = useState(0);
  const pendingStartedAt = useRef<number | null>(null);
  const reportedRef = useRef(false);
  const nudgedRef = useRef(false);
  const nudgeReasonRef = useRef<PendingNudgeReason | null>(null);
  const hrefAtStartRef = useRef<string | null>(null);
  const contextRef = useRef(context);
  contextRef.current = context;

  useEffect(() => {
    if (!isPending) {
      if (reportedRef.current || nudgedRef.current) {
        const started = pendingStartedAt.current;
        const durationMs = started ? Date.now() - started : timeoutMs;
        const ctx = contextRef.current;
        const hrefNow = currentHref();
        const recoveredByNudge = nudgedRef.current && !reportedRef.current;
        const diagnostics = readTransitionDiagnostics(ctx, started);
        posthog.capture("deals_transition_recovered", {
          duration_ms: durationMs,
          pathname: ctx?.pathname,
          sort: ctx?.sort,
          offset: ctx?.offset,
          spec_filter_count: ctx?.specFilterCount ?? 0,
          url_committed: hrefAtStartRef.current != null && hrefNow !== hrefAtStartRef.current,
          recovered_by_nudge: recoveredByNudge,
          nudge_reason: nudgeReasonRef.current,
          ...diagnostics,
        });
        if (reportedRef.current) {
          Sentry.addBreadcrumb({
            category: "deals.navigation",
            level: "info",
            message: "Deals transition recovered after timeout",
            data: {
              duration_ms: durationMs,
              recovered_by_nudge: recoveredByNudge,
              nudge_reason: nudgeReasonRef.current,
              ...diagnostics,
            },
          });
        }
      }
      setTimedOut(false);
      pendingStartedAt.current = null;
      reportedRef.current = false;
      nudgedRef.current = false;
      nudgeReasonRef.current = null;
      hrefAtStartRef.current = null;
      return;
    }

    pendingStartedAt.current = Date.now();
    hrefAtStartRef.current = currentHref();
    setTimedOut(false);
    reportedRef.current = false;
    nudgedRef.current = false;
    nudgeReasonRef.current = null;
    ensureResourceTimingBuffer();
    observeDealsRscFetches();

    const cancelNudge = armPendingNudge({
      readResponseEnded: () =>
        readLatestDealsRscSample(
          contextRef.current?.pathname,
          pendingStartedAt.current ?? Date.now(),
        ).responseEnded,
      nudge: ({ reason }) => {
        nudgedRef.current = true;
        nudgeReasonRef.current = reason;
        const ctx = contextRef.current;
        const started = pendingStartedAt.current;
        const pendingMs = started ? Date.now() - started : timeoutMs;
        const diagnostics = readTransitionDiagnostics(ctx, started);
        Sentry.addBreadcrumb({
          category: "deals.navigation",
          level: "info",
          message: "Deals transition nudge",
          data: { nudge_reason: reason, pending_ms: pendingMs, ...diagnostics },
        });
        posthog.capture("deals_transition_nudged", {
          nudge_reason: reason,
          pending_ms: pendingMs,
          pathname: ctx?.pathname,
          search_params: ctx?.searchParams,
          sort: ctx?.sort,
          offset: ctx?.offset,
          spec_filter_count: ctx?.specFilterCount ?? 0,
          ...diagnostics,
        });
        setNudgeEpoch((epoch) => epoch + 1);
      },
    });

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
      const diagnostics = readTransitionDiagnostics(ctx, started);

      Sentry.withScope((scope) => {
        scope.setTag("surface", "deals_page");
        scope.setTag("failure_mode", "transition_timeout");
        scope.setTag("rsc_response_ended", diagnostics.rsc_response_ended ? "true" : "false");
        scope.setTag("rsc_matched", diagnostics.rsc_matched ? "true" : "false");
        scope.setTag("url_committed", urlCommitted ? "true" : "false");
        scope.setTag("nudge_reason", nudgeReasonRef.current ?? "none");
        scope.setTag("visibility_state", diagnostics.visibility_state);
        scope.setContext("deals_navigation", {
          pathname: ctx?.pathname,
          search_params: ctx?.searchParams,
          sort: ctx?.sort,
          offset: ctx?.offset,
          spec_filter_count: ctx?.specFilterCount ?? 0,
          duration_ms: durationMs,
          url_committed: urlCommitted,
          nudge_reason: nudgeReasonRef.current,
          ...diagnostics,
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
        url_committed: urlCommitted,
        nudge_reason: nudgeReasonRef.current,
        ...diagnostics,
      });
    }, timeoutMs);

    return () => {
      cancelNudge();
      window.clearTimeout(timer);
    };
  }, [isPending, timeoutMs]);

  const effectivePending = isPending && !timedOut;

  const clearTimeoutState = () => setTimedOut(false);

  return {
    isPending: effectivePending,
    timedOut,
    clearTimeoutState,
  };
}
