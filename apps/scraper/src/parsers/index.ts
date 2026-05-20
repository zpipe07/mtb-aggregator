import type { ScrapeResult } from "../types.js";
import type { EnrichResult } from "./jensonusa.js";
import { scrapeJensonUSA, enrichJensonUSA } from "./jensonusa.js";
import { scrapeWorldwideCyclery, enrichWorldwideCyclery } from "./worldwidecyclery.js";
import { scrapeRevelBikes, enrichRevelBikes } from "./revelbikes.js";
import { scrapeBackcountry, enrichBackcountry } from "./backcountry.js";
import { scrapeRideBicycles, enrichRideBicycles } from "./ridebicycles.js";
import {
  scrapeThunderMountainBikes,
  enrichThunderMountainBikes,
} from "./thundermountainbikes.js";
import { scrapeCanyon, enrichCanyon } from "./canyon.js";
import { enrichCompetitiveCyclist } from "./competitivecyclist.js";

export type ParserFn = (url: string) => Promise<ScrapeResult[]>;
export type EnrichFn = (url: string) => Promise<EnrichResult>;

export const PARSERS: Record<string, ParserFn> = {
  jensonusa: scrapeJensonUSA,
  worldwidecyclery: scrapeWorldwideCyclery,
  revelbikes: scrapeRevelBikes,
  backcountry: scrapeBackcountry,
  ridebicycles: scrapeRideBicycles,
  thundermountainbikes: scrapeThunderMountainBikes,
  canyon: scrapeCanyon,
};

export const ENRICHERS: Record<string, EnrichFn> = {
  jensonusa: enrichJensonUSA,
  worldwidecyclery: enrichWorldwideCyclery,
  revelbikes: enrichRevelBikes,
  backcountry: enrichBackcountry,
  ridebicycles: enrichRideBicycles,
  thundermountainbikes: enrichThunderMountainBikes,
  canyon: enrichCanyon,
  competitivecyclist: enrichCompetitiveCyclist,
};

export function getParser(store: string): ParserFn | null {
  return PARSERS[store] ?? null;
}

export function getEnricher(store: string): EnrichFn | null {
  return ENRICHERS[store] ?? null;
}
