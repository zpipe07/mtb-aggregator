import { scrapeGiroSalePl } from "./giro-plp.js";
import { enrichGiroPdp } from "./giro-pdp.js";

export async function scrapeGiro(url: string) {
  return scrapeGiroSalePl(url);
}

export async function enrichGiro(url: string) {
  return enrichGiroPdp(url);
}
