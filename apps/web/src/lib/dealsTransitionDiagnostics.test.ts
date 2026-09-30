import { describe, expect, it } from "vitest";
import {
  latestDealsRscSample,
  readLatestDealsRscSample,
  rememberObservedRsc,
  resetObservedRscEntries,
} from "./dealsTransitionDiagnostics";

const TIME_ORIGIN = 1_000_000;

function rscEntry(opts: {
  name: string;
  startTime: number;
  responseEnd: number;
  duration: number;
  initiatorType?: string;
}): PerformanceResourceTiming {
  return {
    name: opts.name,
    startTime: opts.startTime,
    responseEnd: opts.responseEnd,
    duration: opts.duration,
    initiatorType: opts.initiatorType ?? "fetch",
  } as PerformanceResourceTiming;
}

describe("latestDealsRscSample", () => {
  it("ignores an earlier completed RSC for the same path", () => {
    const pendingStartedAt = TIME_ORIGIN + 5_000;
    const sample = latestDealsRscSample(
      "/deals/c/bikes/mountain",
      pendingStartedAt,
      [
        rscEntry({
          name: "https://thedropper.shop/deals/c/bikes/mountain?_rsc=old",
          startTime: 100,
          responseEnd: 400,
          duration: 300,
        }),
      ],
      TIME_ORIGIN,
    );
    expect(sample).toEqual({
      matched: false,
      responseEnded: false,
      durationMs: null,
      responseEndedAtMs: null,
    });
  });

  it("reports a finished soft-nav that started with this transition", () => {
    const pendingStartedAt = TIME_ORIGIN + 5_000;
    const sample = latestDealsRscSample(
      "/deals/c/components/cockpit/handlebars",
      pendingStartedAt,
      [
        rscEntry({
          name: "https://thedropper.shop/deals/c/components/cockpit/handlebars?spec_clamp_diameter=31.8&_rsc=old",
          startTime: 100,
          responseEnd: 800,
          duration: 700,
        }),
        rscEntry({
          name: "https://thedropper.shop/deals/c/components/cockpit/handlebars?sort=price_desc&_rsc=new",
          startTime: 5_100,
          responseEnd: 8_400,
          duration: 3_300,
        }),
      ],
      TIME_ORIGIN,
    );
    expect(sample).toEqual({
      matched: true,
      responseEnded: true,
      durationMs: 3300,
      responseEndedAtMs: TIME_ORIGIN + 8_400,
    });
  });

  it("treats a headers-only entry as still open", () => {
    const pendingStartedAt = TIME_ORIGIN + 1_000;
    const sample = latestDealsRscSample(
      "/deals",
      pendingStartedAt,
      [
        rscEntry({
          name: "https://thedropper.shop/deals?sort=value&_rsc=open",
          startTime: 1_050,
          responseEnd: 0,
          duration: 0,
        }),
      ],
      TIME_ORIGIN,
    );
    expect(sample.matched).toBe(true);
    expect(sample.responseEnded).toBe(false);
  });

  it("skips non-RSC fetches", () => {
    const sample = latestDealsRscSample(
      "/deals",
      TIME_ORIGIN,
      [
        rscEntry({
          name: "https://thedropper.shop/deals?offset=24",
          startTime: 10,
          responseEnd: 20,
          duration: 10,
        }),
      ],
      TIME_ORIGIN,
    );
    expect(sample.matched).toBe(false);
  });

  it("keeps an RSC entry after it drops out of the resource timing buffer", () => {
    resetObservedRscEntries();
    const origin = performance.timeOrigin;
    rememberObservedRsc(
      rscEntry({
        name: "https://thedropper.shop/deals?sort=price_asc&_rsc=kept",
        startTime: 50,
        responseEnd: 80,
        duration: 30,
      }),
    );
    const sample = readLatestDealsRscSample("/deals", origin + 40);
    expect(sample.matched).toBe(true);
    expect(sample.responseEnded).toBe(true);
    expect(sample.durationMs).toBe(30);
    resetObservedRscEntries();
  });
});
