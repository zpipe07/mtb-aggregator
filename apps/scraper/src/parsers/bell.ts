import { scrapeBellSalePl } from "./bell-plp.js";
import { enrichBellPdp } from "./bell-pdp.js";

export async function scrapeBell(url: string) {
  return scrapeBellSalePl(url);
}

export async function enrichBell(url: string) {
  return enrichBellPdp(url);
}
