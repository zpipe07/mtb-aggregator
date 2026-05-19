import type { EnrichResult } from "./jensonusa.js";
import { ENRICH_DELAY_MS } from "../config.js";
import { runWithBrowser } from "../browser.js";
import {
  persistScraperStorageState,
  shouldPersistStorageAfterPdp,
} from "../storage-state.js";
import {
  extractBackcountryFamilyBreadcrumbs,
  extractBackcountryFamilyDescription,
  extractBackcountryFamilySpecs,
} from "./backcountry-family-pdp.js";
import {
  backcountryFamilyContextOptions,
  waitForBackcountryFamilyPdpReady,
} from "./backcountry-family-plp.js";
import { debugHasVariantParse } from "./cc-pdp-variants.js";

const BRAND_LABEL = "Competitive Cyclist";

function sampleSkus(codes: string[], max = 3): string {
  if (codes.length === 0) return "none";
  return codes.slice(0, max).join(",") + (codes.length > max ? ",…" : "");
}

function enrichFromHtml(
  html: string,
  productUrl: string,
  wafBlocked: boolean,
): { result: EnrichResult; parseDebug: ReturnType<typeof debugHasVariantParse> } {
  const parseDebug = debugHasVariantParse(html);
  const variants = parseDebug.variants;

  console.log(
    `[scraper] competitivecyclist enrich debug: transport=playwright url=${productUrl} html_bytes=${parseDebug.htmlBytes} waf_suspect=${parseDebug.looksLikeWaf || wafBlocked} ld_json_scripts=${parseDebug.ldJsonScriptCount} product_hasVariant_nodes=${parseDebug.productNodesWithHasVariant} variants_parsed=${variants.length} sample_skus=${sampleSkus(variants.map((v) => v.code))}`,
  );

  if (parseDebug.looksLikeWaf || wafBlocked) {
    console.warn(
      `[scraper] competitivecyclist enrich: response looks like WAF/challenge (bytes=${parseDebug.htmlBytes}); hasVariant grouping will not run`,
    );
  }

  const categoryPath = extractBackcountryFamilyBreadcrumbs(html);
  const rawSpecs = extractBackcountryFamilySpecs(html);
  const description = extractBackcountryFamilyDescription(html);

  return {
    parseDebug,
    result: {
      category_path: categoryPath,
      raw_specs: rawSpecs,
      description: description ?? undefined,
      ...(variants.length > 0 ? { variants } : {}),
    },
  };
}

/** PDP enrich only — CC ingest runs via Impact catalog on the API, not POST /scrape. */
export async function enrichCompetitiveCyclist(productUrl: string): Promise<EnrichResult> {
  try {
    return await runWithBrowser(async (browser) => {
      const context = await browser.newContext(backcountryFamilyContextOptions(BRAND_LABEL));
      const page = await context.newPage();
      try {
        await page.goto(productUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
        const { ready, wafBlocked } = await waitForBackcountryFamilyPdpReady(page, BRAND_LABEL);
        if (!ready && !wafBlocked) {
          console.warn(
            `[scraper] ${BRAND_LABEL}: PDP did not show JSON-LD before timeout; parsing partial HTML`,
          );
        }
        await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => undefined);
        const html = await page.content();
        await new Promise((r) => setTimeout(r, ENRICH_DELAY_MS));
        const { result, parseDebug } = enrichFromHtml(html, productUrl, wafBlocked);
        if (shouldPersistStorageAfterPdp(parseDebug, wafBlocked)) {
          await persistScraperStorageState(context, BRAND_LABEL);
        }
        return result;
      } finally {
        await context.close();
      }
    });
  } catch (err) {
    console.error("[scraper] Competitive Cyclist PDP enrich failed:", err);
    return { category_path: null, raw_specs: null };
  }
}
