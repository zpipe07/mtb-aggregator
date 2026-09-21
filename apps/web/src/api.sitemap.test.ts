import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSitemapListings } from "./api";

describe("fetchSitemapListings", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reads compact listing IDs from GET /sitemap-listings", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        listings: [{ id: 10, last_scraped: "2026-09-21T00:00:00Z" }],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const rows = await fetchSitemapListings(100);
    expect(rows).toEqual([
      { id: 10, last_scraped: "2026-09-21T00:00:00Z" },
    ]);
    const calledUrl = String(fetchMock.mock.calls.at(0)?.at(0) ?? "");
    expect(calledUrl).toContain("/sitemap-listings?limit=100");
  });
});
