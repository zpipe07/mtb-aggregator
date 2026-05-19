import type { EnrichResult } from "./jensonusa.js";
import { enrichBackcountryFamilyPdp } from "./backcountry-family-pdp.js";

/** PDP enrich only — CC ingest runs via Impact catalog on the API, not POST /scrape. */
export async function enrichCompetitiveCyclist(productUrl: string): Promise<EnrichResult> {
  return enrichBackcountryFamilyPdp(productUrl);
}
