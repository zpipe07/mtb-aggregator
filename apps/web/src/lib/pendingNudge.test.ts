import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PENDING_NUDGE_AFTER_RSC_MS,
  PENDING_NUDGE_FALLBACK_MS,
  PENDING_NUDGE_POLL_MS,
  armPendingNudge,
} from "./pendingNudge";

describe("armPendingNudge", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("nudges once the RSC body has been finished and the commit did not follow", () => {
    vi.useFakeTimers();
    let ended = false;
    const nudges: { reason: string }[] = [];
    const stop = armPendingNudge({
      readResponseEnded: () => ended,
      nudge: (fire) => nudges.push(fire),
    });

    vi.advanceTimersByTime(PENDING_NUDGE_POLL_MS);
    ended = true;
    vi.advanceTimersByTime(PENDING_NUDGE_POLL_MS);
    expect(nudges).toEqual([]);

    vi.advanceTimersByTime(PENDING_NUDGE_AFTER_RSC_MS + PENDING_NUDGE_POLL_MS);
    expect(nudges.map((fire) => fire.reason)).toEqual(["rsc_settled"]);

    vi.advanceTimersByTime(PENDING_NUDGE_FALLBACK_MS);
    expect(nudges).toHaveLength(1);
    stop();
  });

  it("nudges at the fallback when the RSC entry never appears", () => {
    vi.useFakeTimers();
    const nudges: { reason: string; responseEndedAt: number | null }[] = [];
    const stop = armPendingNudge({
      readResponseEnded: () => false,
      nudge: (fire) => nudges.push(fire),
    });

    vi.advanceTimersByTime(PENDING_NUDGE_FALLBACK_MS - 1);
    expect(nudges).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(nudges).toEqual([{ reason: "fallback", responseEndedAt: null }]);
    stop();
  });

  it("does not nudge after cancel, including when the response already ended", () => {
    vi.useFakeTimers();
    let ended = false;
    const nudges: number[] = [];
    const stop = armPendingNudge({
      readResponseEnded: () => ended,
      nudge: () => nudges.push(1),
    });

    ended = true;
    vi.advanceTimersByTime(PENDING_NUDGE_POLL_MS);
    stop();
    vi.advanceTimersByTime(PENDING_NUDGE_FALLBACK_MS + PENDING_NUDGE_AFTER_RSC_MS);
    expect(nudges).toEqual([]);
  });
});
