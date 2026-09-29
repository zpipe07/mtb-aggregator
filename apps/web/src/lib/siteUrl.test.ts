import { afterEach, describe, expect, it, vi } from "vitest";
import { absoluteUrl, getSiteUrl } from "./siteUrl";

describe("getSiteUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("strips www so canonicals and sitemap stay on the apex host", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.thedropper.shop");
    expect(getSiteUrl().hostname).toBe("thedropper.shop");
    expect(absoluteUrl("/deals/1")).toBe("https://thedropper.shop/deals/1");
  });
});
