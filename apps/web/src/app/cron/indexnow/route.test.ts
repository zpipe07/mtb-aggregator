import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/api", () => ({
  fetchDeals: vi.fn(),
}));

vi.mock("@/lib/indexNow", async () => {
  const actual = await vi.importActual<typeof import("@/lib/indexNow")>(
    "@/lib/indexNow",
  );
  return {
    ...actual,
    submitIndexNow: vi.fn(),
  };
});

import { fetchDeals } from "@/api";
import { GET, POST } from "@/app/cron/indexnow/route";
import { submitIndexNow } from "@/lib/indexNow";

const fetchDealsMock = vi.mocked(fetchDeals);
const submitMock = vi.mocked(submitIndexNow);

describe("GET/POST /cron/indexnow", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    vi.stubEnv("VERCEL_ENV", "production");
    fetchDealsMock.mockReset();
    submitMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects unauthenticated requests", async () => {
    const res = await GET(new Request("https://thedropper.shop/cron/indexnow"));
    expect(res.status).toBe(401);
    expect(submitMock).not.toHaveBeenCalled();
  });

  it("skips submit on preview even when authorized", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    const res = await GET(
      new Request("https://thedropper.shop/cron/indexnow", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skipped).toBe(true);
    expect(submitMock).not.toHaveBeenCalled();
  });

  it("submits core pages plus recent deal URLs in production", async () => {
    fetchDealsMock.mockResolvedValue({
      deals: [
        {
          id: 42,
          store_id: 1,
          store_name: "Test",
          store_sku: "sku",
          product_name: "Bike",
          current_price: 100,
          product_url: "https://example.com",
          is_in_stock: true,
          last_scraped: new Date().toISOString(),
        },
      ],
      total_count: 1,
    });
    submitMock.mockResolvedValue({
      status: "submitted",
      urlCount: 9,
      httpStatus: 202,
    });

    const res = await GET(
      new Request("https://thedropper.shop/cron/indexnow", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );
    expect(res.status).toBe(200);
    expect(submitMock).toHaveBeenCalledTimes(1);
    const urls = submitMock.mock.calls[0][0];
    expect(urls).toContain("https://thedropper.shop/");
    expect(urls).toContain("https://thedropper.shop/deals/42");
  });

  it("POSTs an explicit url list without fetching deals", async () => {
    submitMock.mockResolvedValue({
      status: "submitted",
      urlCount: 1,
      httpStatus: 200,
    });
    const res = await POST(
      new Request("https://thedropper.shop/cron/indexnow", {
        method: "POST",
        headers: {
          authorization: "Bearer cron-secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({ urls: ["https://thedropper.shop/deals/99"] }),
      }),
    );
    expect(res.status).toBe(200);
    expect(fetchDealsMock).not.toHaveBeenCalled();
    expect(submitMock.mock.calls[0][0]).toEqual([
      "https://thedropper.shop/deals/99",
    ]);
  });
});
