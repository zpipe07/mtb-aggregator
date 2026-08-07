import { scrapeSpecializedSalePl } from "./specialized-plp.js";
import { enrichSpecializedPdp } from "./specialized-pdp.js";

export async function scrapeSpecialized(url: string) {
  return scrapeSpecializedSalePl(url);
}

export async function enrichSpecialized(url: string) {
  return enrichSpecializedPdp(url);
}
