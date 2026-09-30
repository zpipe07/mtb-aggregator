/** Poll for the soft-nav RSC entry. */
export const PENDING_NUDGE_POLL_MS = 200;
/**
 * Wait this long after the RSC body finishes before forcing a re-render.
 * Healthy commits land within a few dozen milliseconds of `responseEnd`, so
 * this does not fire on a normal sort or filter change.
 */
export const PENDING_NUDGE_AFTER_RSC_MS = 750;
/** If the RSC entry never shows up (timing buffer, missed pathname), nudge anyway. */
export const PENDING_NUDGE_FALLBACK_MS = 3_000;

const RESOURCE_TIMING_BUFFER = 1_000;

export function ensureResourceTimingBuffer(): void {
  if (typeof performance === "undefined" || !performance.setResourceTimingBufferSize) {
    return;
  }
  try {
    performance.setResourceTimingBufferSize(RESOURCE_TIMING_BUFFER);
  } catch {
    // Older browsers can throw if the buffer is already full of a larger size.
  }
}

/**
 * Schedule a single urgent re-render while a deals transition stays pending
 * after its RSC payload has arrived. Returns a cancel function.
 */
export type PendingNudgeReason = "rsc_settled" | "fallback";

export type PendingNudgeFire = {
  reason: PendingNudgeReason;
  /** Epoch ms when the poll first saw the RSC body finish. Null on a blind fallback. */
  responseEndedAt: number | null;
};

export function armPendingNudge(options: {
  readResponseEnded: () => boolean;
  nudge: (fire: PendingNudgeFire) => void;
  pollMs?: number;
  afterRscMs?: number;
  fallbackMs?: number;
}): () => void {
  const pollMs = options.pollMs ?? PENDING_NUDGE_POLL_MS;
  const afterRscMs = options.afterRscMs ?? PENDING_NUDGE_AFTER_RSC_MS;
  const fallbackMs = options.fallbackMs ?? PENDING_NUDGE_FALLBACK_MS;

  let stopped = false;
  let fired = false;
  let responseEndedAt: number | null = null;

  const fire = (reason: PendingNudgeReason) => {
    if (stopped || fired) return;
    fired = true;
    const endedAt = responseEndedAt;
    clear();
    options.nudge({ reason, responseEndedAt: endedAt });
  };

  const poll = setInterval(() => {
    let ended = false;
    try {
      ended = options.readResponseEnded();
    } catch {
      ended = false;
    }
    if (!ended) return;
    if (responseEndedAt == null) responseEndedAt = Date.now();
    if (Date.now() - responseEndedAt >= afterRscMs) fire("rsc_settled");
  }, pollMs);

  const fallback = setTimeout(() => fire("fallback"), fallbackMs);

  const clear = () => {
    clearInterval(poll);
    clearTimeout(fallback);
  };

  return () => {
    stopped = true;
    clear();
  };
}
