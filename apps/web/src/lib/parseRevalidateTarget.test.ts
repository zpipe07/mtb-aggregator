import { describe, expect, it } from "vitest";
import { parseRevalidateTarget } from "./parseRevalidateTarget";

describe("parseRevalidateTarget", () => {
  it("splits pathname and query", () => {
    expect(parseRevalidateTarget("/deals?sort=price_drop")).toEqual({
      pathname: "/deals",
      search: "?sort=price_drop",
    });
  });

  it("parses full production URL", () => {
    expect(
      parseRevalidateTarget(
        "https://thedropper.shop/deals?sort=price_drop",
      ),
    ).toEqual({
      pathname: "/deals",
      search: "?sort=price_drop",
    });
  });

  it("adds leading slash when missing", () => {
    expect(parseRevalidateTarget("deals")).toEqual({
      pathname: "/deals",
      search: "",
    });
  });

  it("rejects empty input", () => {
    expect(() => parseRevalidateTarget("  ")).toThrow("Path is required");
  });

  it("rejects path traversal", () => {
    expect(() => parseRevalidateTarget("/deals/../admin")).toThrow("..");
  });
});
