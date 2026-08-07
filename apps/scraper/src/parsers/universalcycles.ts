import { scrapeUniversalCyclesSalePl } from "./universalcycles-plp.js";
import { enrichUniversalCyclesPdp } from "./universalcycles-pdp.js";

export async function scrapeUniversalCycles(url: string) {
  return scrapeUniversalCyclesSalePl(url);
}

export async function enrichUniversalCycles(url: string) {
  return enrichUniversalCyclesPdp(url);
}
