import * as cheerio from "cheerio";

import { BROWSER_USER_AGENT, ENRICH_DELAY_MS } from "../config.js";
import type { EnrichResult } from "./jensonusa.js";
import { N1_ORIGIN } from "./n1bikes-plp.js";

function cleanText(t: string | null | undefined): string {
  return (t || "").replace(/\s+/g, " ").trim();
}

/** Unescape RSC-embedded JSON string chunks in SSR HTML. */
export function unescapeN1EmbeddedJson(raw: string): string {
  return raw
    .replace(/\\"/g, '"')
    .replace(/\\n/g, "\n")
    .replace(/\\u003c/g, "<")
    .replace(/\\u003e/g, ">")
    .replace(/\\u0026/g, "&");
}

export function extractN1EmbeddedJsonField(
  html: string,
  field: string,
): unknown | null {
  const patterns = [
    new RegExp(
      `specifications\\\\":(\\{[\\s\\S]*?\\})(?=,\\\\"geometry)`,
    ),
    new RegExp(
      `\\\\"${field}\\\\":(\\{[\\s\\S]*?\\})(?=,\\\\"(?:geometry|vendor|variants|options|primaryImage|minPrice))`,
    ),
    new RegExp(
      `"${field}":(\\{[\\s\\S]*?\\})(?=,"(?:geometry|vendor|variants|options|primaryImage|minPrice))`,
    ),
  ];

  for (const re of patterns) {
    const m = re.exec(html);
    if (!m?.[1]) continue;
    try {
      return JSON.parse(unescapeN1EmbeddedJson(m[1]));
    } catch {
      /* try next pattern */
    }
  }
  return null;
}

export function extractN1ProductType(html: string): string | null {
  const patterns = [
    /\\"type\\":\\"([^\\"]+)\\",\\"vendor\\":/,
    /type\\":\\"([^\\"]+)\\",\\"vendor\\":/,
    /"type":"([^"]+)","vendor":"/,
  ];
  for (const re of patterns) {
    const m = re.exec(html);
    if (m?.[1]?.trim()) return m[1].trim();
  }
  return null;
}

export function flattenN1Specifications(
  specs: Record<string, string[] | string> | null | undefined,
): Record<string, string> | null {
  if (!specs) return null;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(specs)) {
    const k = cleanText(key);
    if (!k) continue;
    const v = Array.isArray(value)
      ? value.map((x) => cleanText(String(x))).filter(Boolean).join(", ")
      : cleanText(String(value));
    if (v) out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

export function extractN1OgDescription(html: string): string | null {
  const $ = cheerio.load(html);
  const desc = cleanText($('meta[property="og:description"]').attr("content"));
  return desc.length >= 20 ? desc : null;
}

export function enrichN1BikesPdpFromHtml(html: string): EnrichResult {
  const specsRaw = extractN1EmbeddedJsonField(html, "specifications") as
    | Record<string, string[] | string>
    | null;
  const raw_specs = flattenN1Specifications(specsRaw);

  const productType = extractN1ProductType(html);
  const category_path = productType ? [productType] : null;

  const description = extractN1OgDescription(html);

  return {
    category_path,
    raw_specs,
    description: description ?? undefined,
  };
}

export async function enrichN1BikesPdp(url: string): Promise<EnrichResult> {
  if (ENRICH_DELAY_MS > 0) {
    await new Promise((r) => setTimeout(r, ENRICH_DELAY_MS));
  }

  const res = await fetch(url, {
    headers: {
      Accept: "text/html,*/*",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: `${N1_ORIGIN}/`,
      "User-Agent": BROWSER_USER_AGENT,
    },
  });
  if (!res.ok) {
    throw new Error(`N+1 PDP ${res.status}: ${res.statusText}`);
  }
  const html = await res.text();
  return enrichN1BikesPdpFromHtml(html);
}
