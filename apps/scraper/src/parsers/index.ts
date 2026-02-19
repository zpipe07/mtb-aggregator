import type { ScrapeResult } from "../types.js";
import { scrapeJensonUSA } from "./jensonusa.js";

export type ParserFn = (url: string) => Promise<ScrapeResult[]>;

export const PARSERS: Record<string, ParserFn> = {
  jensonusa: scrapeJensonUSA,
};

export function getParser(store: string): ParserFn | null {
  return PARSERS[store] ?? null;
}
