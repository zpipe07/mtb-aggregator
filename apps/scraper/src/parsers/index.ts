import type { ScrapeResult } from "../types.js";
import type { EnrichResult } from "./jensonusa.js";
import { scrapeJensonUSA, enrichJensonUSA } from "./jensonusa.js";

export type ParserFn = (url: string) => Promise<ScrapeResult[]>;
export type EnrichFn = (url: string) => Promise<EnrichResult>;

export const PARSERS: Record<string, ParserFn> = {
  jensonusa: scrapeJensonUSA,
};

export const ENRICHERS: Record<string, EnrichFn> = {
  jensonusa: enrichJensonUSA,
};

export function getParser(store: string): ParserFn | null {
  return PARSERS[store] ?? null;
}

export function getEnricher(store: string): EnrichFn | null {
  return ENRICHERS[store] ?? null;
}
