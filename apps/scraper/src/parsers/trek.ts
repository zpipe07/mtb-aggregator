import { scrapeTrekSalePl } from "./trek-plp.js";
import { enrichTrekPdp } from "./trek-pdp.js";

export async function scrapeTrek(url: string) {
  return scrapeTrekSalePl(url);
}

export async function enrichTrek(url: string) {
  return enrichTrekPdp(url);
}
