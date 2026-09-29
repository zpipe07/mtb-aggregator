import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchGiveaways } from "./api";

describe("fetchGiveaways cache key", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps the 60s giveaways URL free of the homepage TTL discriminator", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        giveaways: [],
        open_count: 0,
        upcoming_count: 0,
        ended_count: 0,
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchGiveaways();

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { next?: { revalidate: number; tags: string[] } },
    ];
    expect(url).not.toContain("_isr=");
    expect(init.next).toEqual({
      revalidate: 60,
      tags: ["public-data", "giveaways"],
    });
  });

  it("uses a distinct URL when the homepage asks for the 4h TTL", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        giveaways: [],
        open_count: 0,
        upcoming_count: 0,
        ended_count: 0,
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchGiveaways({ revalidate: 14_400 });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { next?: { revalidate: number } },
    ];
    expect(url).toContain("_isr=14400");
    expect(init.next).toMatchObject({ revalidate: 14_400 });
  });
});
