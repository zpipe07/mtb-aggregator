import { scrapeFoxRacingSalePl } from "./foxracing-plp.js";
import { enrichFoxRacingPdp } from "./foxracing-pdp.js";

export async function scrapeFoxRacing(url: string) {
  return scrapeFoxRacingSalePl(url);
}

export async function enrichFoxRacing(url: string) {
  return enrichFoxRacingPdp(url);
}
