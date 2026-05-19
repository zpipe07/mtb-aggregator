import type { BrowserContext } from "playwright";
import { SCRAPER_STORAGE_STATE } from "./config.js";
import type { HasVariantParseDebug } from "./parsers/cc-pdp-variants.js";

/** True when the PDP looks like a real product page (not WAF) worth persisting cookies for. */
export function shouldPersistStorageAfterPdp(
  parseDebug: HasVariantParseDebug,
  wafBlocked: boolean,
): boolean {
  if (wafBlocked || parseDebug.looksLikeWaf) return false;
  return parseDebug.ldJsonScriptCount > 0;
}

/** Overwrite SCRAPER_STORAGE_STATE with cookies/localStorage from the current browser context. */
export async function persistScraperStorageState(
  context: BrowserContext,
  label: string,
): Promise<void> {
  if (!SCRAPER_STORAGE_STATE) return;
  try {
    await context.storageState({ path: SCRAPER_STORAGE_STATE });
    console.log(`[scraper] ${label}: saved storage state to ${SCRAPER_STORAGE_STATE}`);
  } catch (err) {
    console.warn(
      `[scraper] ${label}: failed to save storage state to ${SCRAPER_STORAGE_STATE}:`,
      err,
    );
  }
}
