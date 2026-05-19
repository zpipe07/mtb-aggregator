import { describe, expect, it } from "vitest";
import { getEnricher, getParser } from "./index.js";
import { EnrichRequestSchema, ScrapeRequestSchema } from "../types.js";

describe("competitivecyclist enrich-only registration", () => {
  it("registers an enricher but not a scrape parser", () => {
    expect(getEnricher("competitivecyclist")).toBeTypeOf("function");
    expect(getParser("competitivecyclist")).toBeNull();
  });

  it("accepts competitivecyclist on EnrichRequestSchema", () => {
    const parsed = EnrichRequestSchema.safeParse({
      url: "https://www.competitivecyclist.com/p/example",
      store: "competitivecyclist",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects competitivecyclist on ScrapeRequestSchema", () => {
    const parsed = ScrapeRequestSchema.safeParse({
      url: "https://www.competitivecyclist.com/rc/bikes-on-sale",
      store: "competitivecyclist",
    });
    expect(parsed.success).toBe(false);
  });
});
