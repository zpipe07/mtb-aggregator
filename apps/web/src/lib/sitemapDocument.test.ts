import { describe, expect, it } from "vitest";
import {
  SITEMAP_CDN_MAX_AGE_SECONDS,
  SITEMAP_RESPONSE_HEADERS,
  sitemapEntriesToXml,
} from "./sitemapDocument";

describe("sitemapEntriesToXml", () => {
  it("emits loc, lastmod, changefreq, and priority", () => {
    const xml = sitemapEntriesToXml([
      {
        url: "https://thedropper.shop/deals/12",
        lastModified: new Date("2026-09-01T00:00:00.000Z"),
        changeFrequency: "weekly",
        priority: 0.5,
      },
    ]);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain("<loc>https://thedropper.shop/deals/12</loc>");
    expect(xml).toContain("<lastmod>2026-09-01T00:00:00.000Z</lastmod>");
    expect(xml).toContain("<changefreq>weekly</changefreq>");
    expect(xml).toContain("<priority>0.5</priority>");
    expect(xml.trimEnd().endsWith("</urlset>")).toBe(true);
  });
});

describe("sitemap CDN cache", () => {
  it("lets the edge hold the document for the public ISR window", () => {
    expect(SITEMAP_CDN_MAX_AGE_SECONDS).toBe(14_400);
    expect(SITEMAP_RESPONSE_HEADERS["Cache-Control"]).toBe(
      "public, max-age=0, must-revalidate",
    );
    expect(SITEMAP_RESPONSE_HEADERS["Vercel-CDN-Cache-Control"]).toContain(
      "s-maxage=14400",
    );
  });
});
