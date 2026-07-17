import { useEffect, useRef, useState } from "react";
import * as Sentry from "@sentry/nextjs";
import posthog from "posthog-js";

export type PendingTimeoutContext = {
  pathname?: string;
  searchParams?: string;
  sort?: string;
  offset?: number;
};

const DEFAULT_TIMEOUT_MS = 15_000;

export function usePendingTimeout(
  isPending: boolean,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  context?: PendingTimeoutContext,
) {
  const [timedOut, setTimedOut] = useState(false);
  const pendingStartedAt = useRef<number | null>(null);
  const reportedRef = useRef(false);
  const contextRef = useRef(context);
  contextRef.current = context;

  useEffect(() => {
    if (!isPending) {
      setTimedOut(false);
      pendingStartedAt.current = null;
      reportedRef.current = false;
      return;
    }

    pendingStartedAt.current = Date.now();
    setTimedOut(false);
    reportedRef.current = false;

    const timer = window.setTimeout(() => {
      setTimedOut(true);
      if (reportedRef.current) return;
      reportedRef.current = true;

      const ctx = contextRef.current;
      const durationMs = pendingStartedAt.current
        ? Date.now() - pendingStartedAt.current
        : timeoutMs;

      Sentry.withScope((scope) => {
        scope.setTag("surface", "deals_page");
        scope.setTag("failure_mode", "transition_timeout");
        scope.setContext("deals_navigation", {
          pathname: ctx?.pathname,
          search_params: ctx?.searchParams,
          sort: ctx?.sort,
          offset: ctx?.offset,
        });
        Sentry.captureMessage("Deals transition timed out", "warning");
      });

      posthog.capture("deals_transition_timeout", {
        duration_ms: durationMs,
        pathname: ctx?.pathname,
        search_params: ctx?.searchParams,
        sort: ctx?.sort,
        offset: ctx?.offset,
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
