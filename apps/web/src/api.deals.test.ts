import { afterEach, describe, expect, it, vi } from "vitest";
import {
  dealsStableCountParams,
  fetchDeals,
  fetchWithRetry,
  isFetchTimeoutError,
} from "./api";

describe("dealsStableCountParams", () => {
  it("pins offset and limit so every page shares one count cache key", () => {
    expect(
      dealsStableCountParams({
        category_slug: "bikes-mountain",
        offset: 24,
        limit: 24,
        sort: "value",
        stableTotalCount: true,
      }),
    ).toEqual({
      category_slug: "bikes-mountain",
      offset: 0,
      limit: 1,
      sort: "value",
    });
  });
});

describe("fetchDeals stableTotalCount", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses the offset=0 count when the page fetch reports a different total", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const total = url.includes("offset=0") && url.includes("limit=1") ? 187 : 188;
      return {
        ok: true,
        json: async () => ({ deals: [{ id: 1 }], total_count: total }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchDeals({
      category_slug: "bikes-mountain",
      offset: 24,
      limit: 24,
      stableTotalCount: true,
      noStore: true,
    });

    expect(res.total_count).toBe(187);
    expect(res.deals).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("fetchWithRetry deadlines", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("fails a hung attempt once and does not retry", async () => {
    const fetchMock = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          if (!signal) return;
          const onAbort = () => {
            reject(
              signal.reason instanceof Error
                ? signal.reason
                : new DOMException("timed out", "TimeoutError"),
            );
          };
          if (signal.aborted) onAbort();
          else signal.addEventListener("abort", onAbort, { once: true });
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchWithRetry("https://api.example.test/deals", undefined, {
        timeoutMs: 30,
        retries: 2,
      }),
    ).rejects.toThrow("Public API fetch timed out");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a fast 502 and then returns the next ok response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 502 })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchWithRetry("https://api.example.test/deals", undefined, {
      timeoutMs: 1000,
      retries: 2,
      delaysMs: [0, 0],
    });

    expect(res.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("recognizes TimeoutError by name", () => {
    const err = new DOMException("timed out", "TimeoutError");
    expect(isFetchTimeoutError(err)).toBe(true);
    expect(isFetchTimeoutError(new Error("nope"))).toBe(false);
  });
});
