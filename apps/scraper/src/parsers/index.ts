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
import { scrapeMackCycle, enrichMackCycle } from "./mackcycle.js";
import { scrapeCanyon, enrichCanyon } from "./canyon.js";
import { scrapeSpecialized, enrichSpecialized } from "./specialized.js";
import { scrapeTrek, enrichTrek } from "./trek.js";
import { scrapeUniversalCycles, enrichUniversalCycles } from "./universalcycles.js";
import { scrapeN1Bikes, enrichN1Bikes } from "./n1bikes.js";
import { scrapeRideConcepts, enrichRideConcepts } from "./rideconcepts.js";
import { scrapeLeatt, enrichLeatt } from "./leatt.js";
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
  mackcycle: scrapeMackCycle,
  canyon: scrapeCanyon,
  specialized: scrapeSpecialized,
  trek: scrapeTrek,
  universalcycles: scrapeUniversalCycles,
  n1bikes: scrapeN1Bikes,
  rideconcepts: scrapeRideConcepts,
  leatt: scrapeLeatt,
};

export const ENRICHERS: Record<string, EnrichFn> = {
  jensonusa: enrichJensonUSA,
  worldwidecyclery: enrichWorldwideCyclery,
  revelbikes: enrichRevelBikes,
  backcountry: enrichBackcountry,
  ridebicycles: enrichRideBicycles,
  thundermountainbikes: enrichThunderMountainBikes,
  mackcycle: enrichMackCycle,
  canyon: enrichCanyon,
  specialized: enrichSpecialized,
  trek: enrichTrek,
  universalcycles: enrichUniversalCycles,
  n1bikes: enrichN1Bikes,
  rideconcepts: enrichRideConcepts,
  leatt: enrichLeatt,
  competitivecyclist: enrichCompetitiveCyclist,
};

export function getParser(store: string): ParserFn | null {
  return PARSERS[store] ?? null;
}

export function getEnricher(store: string): EnrichFn | null {
  return ENRICHERS[store] ?? null;
}
