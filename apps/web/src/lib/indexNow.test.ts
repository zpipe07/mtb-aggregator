import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { config as middlewareConfig } from "@/middleware";
import robots from "@/app/robots";
import {
  INDEXNOW_CORE_PATHS,
  INDEXNOW_ENDPOINT,
  INDEXNOW_HOST,
  INDEXNOW_KEY,
  INDEXNOW_KEY_LOCATION,
  INDEXNOW_KEY_PATH,
  canonicalizeIndexNowUrl,
  coreIndexNowUrls,
  indexNowUrlForPath,
  isIndexNowEnabled,
  isRecentScrape,
  submitIndexNow,
  uniqueIndexNowUrls,
} from "./indexNow";

const KEY_FILE = "public/5130963c54f0f6fab8dede8ea6f6e38c.txt";

describe("IndexNow key file", () => {
  it("is hosted at the apex root path and contains only the key", () => {
    const raw = readFileSync(KEY_FILE, "utf8");
    expect(raw.trimEnd()).toBe(INDEXNOW_KEY);
    expect(INDEXNOW_KEY_PATH).toBe(`/${INDEXNOW_KEY}.txt`);
    expect(INDEXNOW_KEY_LOCATION).toBe(
      `https://${INDEXNOW_HOST}/${INDEXNOW_KEY}.txt`,
    );
  });
});

describe("middleware / robots do not block the key file", () => {
  it("does not match root .txt paths (matcher is deals-only)", () => {
    expect(middlewareConfig.matcher).toEqual(["/deals", "/deals/:path*"]);
  });

  it("allows the key file and only disallows admin and cron", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://thedropper.shop");
    try {
      const body = robots();
      const rules = Array.isArray(body.rules) ? body.rules[0] : body.rules;
      expect(rules?.allow).toBe("/");
      expect(rules?.disallow).toEqual(["/admin/", "/cron/"]);
      expect(JSON.stringify(rules?.disallow)).not.toContain(".txt");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("isIndexNowEnabled", () => {
  it("is true only on Vercel production", () => {
    expect(isIndexNowEnabled({ VERCEL_ENV: "production" })).toBe(true);
    expect(isIndexNowEnabled({ VERCEL_ENV: "preview" })).toBe(false);
    expect(isIndexNowEnabled({ VERCEL_ENV: "development" })).toBe(false);
    expect(isIndexNowEnabled({})).toBe(false);
  });

  it("can be disabled with INDEXNOW_SUBMIT=0", () => {
    expect(
      isIndexNowEnabled({ VERCEL_ENV: "production", INDEXNOW_SUBMIT: "0" }),
    ).toBe(false);
  });
});

describe("canonicalizeIndexNowUrl", () => {
  it("accepts apex paths and strips query strings", () => {
    expect(canonicalizeIndexNowUrl("/deals/123")).toBe(
      "https://thedropper.shop/deals/123",
    );
    expect(
      canonicalizeIndexNowUrl("https://thedropper.shop/deals?sort=value"),
    ).toBe("https://thedropper.shop/deals");
  });

  it("rejects www, http, other hosts, and noindex surfaces", () => {
    expect(
      canonicalizeIndexNowUrl("https://www.thedropper.shop/deals"),
    ).toBeNull();
    expect(canonicalizeIndexNowUrl("http://thedropper.shop/deals")).toBeNull();
    expect(canonicalizeIndexNowUrl("https://example.com/deals")).toBeNull();
    expect(canonicalizeIndexNowUrl("/admin/cache")).toBeNull();
    expect(canonicalizeIndexNowUrl("/cron/indexnow")).toBeNull();
    expect(canonicalizeIndexNowUrl("/links")).toBeNull();
    expect(canonicalizeIndexNowUrl("/deals/9/price-history")).toBeNull();
  });
});

describe("uniqueIndexNowUrls", () => {
  it("dedupes and keeps core money URLs", () => {
    const urls = uniqueIndexNowUrls([
      "/deals/1",
      "https://thedropper.shop/deals/1?from=home",
      "/admin/x",
      ...INDEXNOW_CORE_PATHS,
    ]);
    expect(urls[0]).toBe("https://thedropper.shop/deals/1");
    expect(urls).toContain("https://thedropper.shop/");
    expect(urls).toContain("https://thedropper.shop/deals/c/bikes/emtb");
    expect(urls.filter((u) => u.includes("/deals/1"))).toHaveLength(1);
  });
});

describe("isRecentScrape", () => {
  const now = new Date("2026-09-14T12:00:00.000Z");
  const day = 24 * 60 * 60 * 1000;

  it("includes missing timestamps and values inside the lookback", () => {
    expect(isRecentScrape(undefined, day, now)).toBe(true);
    expect(isRecentScrape("2026-09-14T08:00:00.000Z", day, now)).toBe(true);
    expect(isRecentScrape("2026-09-12T12:00:00.000Z", day, now)).toBe(false);
  });
});

describe("submitIndexNow", () => {
  it("does not call the API from preview", async () => {
    const fetchImpl = vi.fn();
    const result = await submitIndexNow(["/deals"], {
      env: { VERCEL_ENV: "preview" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toEqual({ status: "skipped", reason: "not production" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("POSTs host, key, keyLocation, and urlList in production", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      status: 202,
      text: async () => "",
    });
    const result = await submitIndexNow(
      ["/deals/42", "https://thedropper.shop/deals/42"],
      {
        env: { VERCEL_ENV: "production" },
        fetchImpl: fetchImpl as unknown as typeof fetch,
        endpoint: INDEXNOW_ENDPOINT,
      },
    );
    expect(result).toEqual({
      status: "submitted",
      urlCount: 1,
      httpStatus: 202,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(INDEXNOW_ENDPOINT);
    expect(init.method).toBe("POST");
    const payload = JSON.parse(String(init.body));
    expect(payload).toEqual({
      host: INDEXNOW_HOST,
      key: INDEXNOW_KEY,
      keyLocation: INDEXNOW_KEY_LOCATION,
      urlList: ["https://thedropper.shop/deals/42"],
    });
  });

  it("treats HTTP 200 as success", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      status: 200,
      text: async () => "",
    });
    const result = await submitIndexNow(coreIndexNowUrls(), {
      env: { VERCEL_ENV: "production" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.status).toBe("submitted");
    if (result.status === "submitted") {
      expect(result.httpStatus).toBe(200);
      expect(result.urlCount).toBe(INDEXNOW_CORE_PATHS.length);
    }
  });

  it("returns empty when every URL is ineligible", async () => {
    const fetchImpl = vi.fn();
    const result = await submitIndexNow(["https://www.thedropper.shop/"], {
      env: { VERCEL_ENV: "production" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.status).toBe("empty");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("surfaces non-success IndexNow status", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      status: 403,
      text: async () => "key not valid",
    });
    const result = await submitIndexNow(["/"], {
      env: { VERCEL_ENV: "production" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.httpStatus).toBe(403);
      expect(result.message).toContain("403");
    }
  });
});

describe("indexNowUrlForPath", () => {
  it("builds apex https URLs", () => {
    expect(indexNowUrlForPath("/")).toBe("https://thedropper.shop/");
    expect(indexNowUrlForPath("deals")).toBe("https://thedropper.shop/deals");
  });
});
