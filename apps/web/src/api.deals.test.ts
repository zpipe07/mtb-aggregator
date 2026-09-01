import { afterEach, describe, expect, it, vi } from "vitest";
import { dealsStableCountParams, fetchDeals } from "./api";

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
