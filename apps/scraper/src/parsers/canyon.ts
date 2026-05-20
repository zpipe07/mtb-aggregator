import { scrapeCanyonSalePl } from "./canyon-plp.js";
import { enrichCanyonPdp } from "./canyon-pdp.js";

export async function scrapeCanyon(url: string) {
  return scrapeCanyonSalePl(url);
}

export async function enrichCanyon(url: string) {
  return enrichCanyonPdp(url);
}
