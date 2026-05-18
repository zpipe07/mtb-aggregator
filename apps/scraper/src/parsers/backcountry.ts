import type { ScrapeResult } from "../types.js";
import type { EnrichResult } from "./jensonusa.js";
import { scrapeBackcountryFamilySalePl } from "./backcountry-family-plp.js";
import { enrichBackcountryFamilyPdp } from "./backcountry-family-pdp.js";
import { runWithBrowser } from "../browser.js";

/**
 * Scrape Backcountry sale/closeout pages using Playwright.
 * Same PLP extractor as Competitive Cyclist (Backcountry-family sites).
 */
export async function scrapeBackcountry(url: string): Promise<ScrapeResult[]> {
  return runWithBrowser((browser) =>
    scrapeBackcountryFamilySalePl(browser, {
      startUrl: url,
      brandLabel: "Backcountry",
      debugFilePrefix: "backcountry",
    })
  );
}

export async function enrichBackcountry(productUrl: string): Promise<EnrichResult> {
  return enrichBackcountryFamilyPdp(productUrl);
}
