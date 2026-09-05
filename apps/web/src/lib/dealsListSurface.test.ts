import { describe, expect, it } from "vitest";
import {
  dealsListSurfaceFromListHref,
  dealsListSurfaceFromPathname,
} from "./dealsListSurface";

describe("dealsListSurfaceFromPathname", () => {
  it("classifies listing routes", () => {
    expect(dealsListSurfaceFromPathname("/deals/hub/emtbs-under-5000")).toBe(
      "hub",
    );
    expect(dealsListSurfaceFromPathname("/deals/c/gear/helmets")).toBe(
      "category",
    );
    expect(dealsListSurfaceFromPathname("/deals")).toBe("deals_list");
    expect(dealsListSurfaceFromPathname("/")).toBe("home");
    expect(dealsListSurfaceFromPathname("/blog/mtb-starter-kit")).toBe("blog");
    expect(dealsListSurfaceFromPathname("/blog")).toBe("blog");
    expect(dealsListSurfaceFromPathname("/giveaways")).toBe("other");
    expect(dealsListSurfaceFromPathname(null)).toBe("other");
  });
});

describe("dealsListSurfaceFromListHref", () => {
  it("reads the pathname from a list href", () => {
    expect(
      dealsListSurfaceFromListHref("/blog/mtb-starter-kit?utm=test"),
    ).toBe("blog");
  });
});
