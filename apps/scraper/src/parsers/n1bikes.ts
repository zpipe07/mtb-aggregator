import { scrapeN1BikesSalePl } from "./n1bikes-plp.js";
import { enrichN1BikesPdp } from "./n1bikes-pdp.js";

export async function scrapeN1Bikes(url: string) {
  return scrapeN1BikesSalePl(url);
}

export async function enrichN1Bikes(url: string) {
  return enrichN1BikesPdp(url);
}
