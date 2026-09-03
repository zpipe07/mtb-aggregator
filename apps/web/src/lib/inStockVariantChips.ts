import type { Deal, DealVariantRow } from "@/api";

export type VariantChip = {
  label: string;
  minPrice: number;
  maxPrice: number;
};

export type VariantChipGroup = {
  key: string;
  kind: "size" | "color" | "other";
  chips: VariantChip[];
  hasPriceSpread: boolean;
};

export type InStockVariantChipSummary = {
  inStockCount: number;
  listedCount: number;
  sizes: VariantChip[];
  colors: VariantChip[];
  groups: VariantChipGroup[];
  sizesHavePriceSpread: boolean;
  colorsHavePriceSpread: boolean;
};

const LETTER_SIZE_RANK: Record<string, number> = {
  XXS: 0,
  XS: 1,
  S: 2,
  SM: 2,
  M: 3,
  MD: 3,
  L: 4,
  LG: 4,
  XL: 5,
  XXL: 6,
  XXXL: 7,
  "3XL": 7,
  "4XL": 8,
  "5XL": 9,
};

const WORD_SIZE_RANK: Record<string, number> = {
  "xx-small": 0,
  xxs: 0,
  "extra extra small": 0,
  "x-small": 1,
  xsmall: 1,
  "extra small": 1,
  small: 2,
  medium: 3,
  large: 4,
  "x-large": 5,
  xlarge: 5,
  "extra large": 5,
  "xx-large": 6,
  xxlarge: 6,
  "2x-large": 6,
  "2xlarge": 6,
  "extra extra large": 6,
  "xxx-large": 7,
  xxxlarge: 7,
  "3x-large": 7,
  "3xlarge": 7,
};

const COMPACT_CHIP_LIMIT = 6;

function isRecord(value: unknown): value is Record<string, string> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function optionKind(key: string): "size" | "color" | "other" {
  const k = key.trim().toLowerCase();
  if (!k || /^option\s*\d+$/i.test(k)) return "other";
  if (/(colou?r|colourway|colorway|finish)/i.test(k)) return "color";
  if (/\bsize\b/i.test(k) || k === "size") return "size";
  return "other";
}

function letterSizeRank(raw: string): number | null {
  const t = raw.toUpperCase().replace(/[\s-]/g, "");
  if (t in LETTER_SIZE_RANK) return LETTER_SIZE_RANK[t];
  return null;
}

export function compareVariantChipLabels(a: string, b: string): number {
  const aWord = WORD_SIZE_RANK[a.trim().toLowerCase()];
  const bWord = WORD_SIZE_RANK[b.trim().toLowerCase()];
  if (aWord != null || bWord != null) {
    return (aWord ?? 100) - (bWord ?? 100) || a.localeCompare(b, undefined, { numeric: true });
  }
  const aLetter = letterSizeRank(a);
  const bLetter = letterSizeRank(b);
  if (aLetter != null || bLetter != null) {
    return (aLetter ?? 100) - (bLetter ?? 100) || a.localeCompare(b, undefined, { numeric: true });
  }
  const aNum = Number.parseFloat(a.replace(/^[^\d.+-]+/, ""));
  const bNum = Number.parseFloat(b.replace(/^[^\d.+-]+/, ""));
  if (Number.isFinite(aNum) && Number.isFinite(bNum) && aNum !== bNum) {
    return aNum - bNum;
  }
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function chipsHavePriceSpread(chips: VariantChip[]): boolean {
  if (chips.length < 2) {
    return chips.some((c) => c.minPrice !== c.maxPrice);
  }
  const first = chips[0].minPrice;
  return chips.some((c) => c.minPrice !== first || c.maxPrice !== first);
}

function collectRows(deal: Deal): DealVariantRow[] {
  if (deal.variants != null && deal.variants.length > 0) {
    return deal.variants;
  }
  if (deal.variant_options && Object.keys(deal.variant_options).length > 0) {
    return [
      {
        id: deal.id,
        store_sku: deal.store_sku,
        variant_options: deal.variant_options,
        current_price: deal.current_price,
        original_price: deal.original_price,
        is_in_stock: deal.is_in_stock,
      },
    ];
  }
  return [];
}

export function inStockDealVariants(deal: Deal): DealVariantRow[] {
  return collectRows(deal).filter((row) => row.is_in_stock);
}

/** Min/max current price among in-stock variants (ignores sold-out SKUs). */
export function inStockPriceRange(
  deal: Deal,
): { min: number; max: number; spread: boolean } | null {
  const rows = inStockDealVariants(deal);
  if (rows.length === 0) return null;
  let min = rows[0].current_price;
  let max = rows[0].current_price;
  for (const row of rows) {
    min = Math.min(min, row.current_price);
    max = Math.max(max, row.current_price);
  }
  return { min, max, spread: min !== max };
}

/** Price range to render: in-stock spread when variants exist, else API `price_range`. */
export function displayPriceRange(deal: Deal): number[] | undefined {
  const stock = inStockPriceRange(deal);
  if (stock) {
    return stock.spread ? [stock.min, stock.max] : undefined;
  }
  const range = deal.price_range;
  if (range != null && range.length === 2 && range[0] !== range[1]) {
    return range;
  }
  return undefined;
}

function addChip(
  byLabel: Map<string, VariantChip>,
  label: string,
  price: number,
) {
  const key = label.trim();
  if (!key) return;
  const existing = byLabel.get(key.toLowerCase());
  if (!existing) {
    byLabel.set(key.toLowerCase(), {
      label: key,
      minPrice: price,
      maxPrice: price,
    });
    return;
  }
  existing.minPrice = Math.min(existing.minPrice, price);
  existing.maxPrice = Math.max(existing.maxPrice, price);
}

function sortedChips(byLabel: Map<string, VariantChip>): VariantChip[] {
  return [...byLabel.values()].toSorted((a, b) =>
    compareVariantChipLabels(a.label, b.label),
  );
}

export function summarizeInStockVariantChips(
  deal: Deal,
): InStockVariantChipSummary | null {
  const listed = collectRows(deal);
  const inStock = listed.filter((row) => row.is_in_stock);
  if (inStock.length === 0) return null;

  const sizeByLabel = new Map<string, VariantChip>();
  const colorByLabel = new Map<string, VariantChip>();
  const otherByKey = new Map<string, Map<string, VariantChip>>();

  for (const row of inStock) {
    const options = isRecord(row.variant_options) ? row.variant_options : null;
    if (!options) continue;
    for (const [rawKey, rawVal] of Object.entries(options)) {
      const key = rawKey.trim();
      const val = String(rawVal ?? "").trim();
      if (!key || !val) continue;
      const kind = optionKind(key);
      if (kind === "size") {
        addChip(sizeByLabel, val, row.current_price);
      } else if (kind === "color") {
        addChip(colorByLabel, val, row.current_price);
      } else {
        const bucket = otherByKey.get(key) ?? new Map<string, VariantChip>();
        addChip(bucket, val, row.current_price);
        otherByKey.set(key, bucket);
      }
    }
  }

  const sizes = sortedChips(sizeByLabel);
  const colors = sortedChips(colorByLabel);
  const groups: VariantChipGroup[] = [];

  if (sizes.length > 0) {
    groups.push({
      key: "Size",
      kind: "size",
      chips: sizes,
      hasPriceSpread: chipsHavePriceSpread(sizes),
    });
  }
  if (colors.length > 0) {
    groups.push({
      key: "Color",
      kind: "color",
      chips: colors,
      hasPriceSpread: chipsHavePriceSpread(colors),
    });
  }
  for (const [key, bucket] of otherByKey) {
    const chips = sortedChips(bucket);
    if (chips.length === 0) continue;
    groups.push({
      key,
      kind: "other",
      chips,
      hasPriceSpread: chipsHavePriceSpread(chips),
    });
  }

  if (groups.length === 0) return null;

  return {
    inStockCount: inStock.length,
    listedCount: listed.length,
    sizes,
    colors,
    groups,
    sizesHavePriceSpread: chipsHavePriceSpread(sizes),
    colorsHavePriceSpread: chipsHavePriceSpread(colors),
  };
}

/** Frame size from LLM / variant sync when the listing has no parseable size options. */
export function extractedBikeSize(deal: Deal): string | null {
  const raw = deal.metadata?.llm_specs?.bike_size;
  if (typeof raw !== "string") return null;
  const label = raw.trim();
  return label || null;
}

function extractedSizeGroup(deal: Deal): VariantChipGroup | null {
  const label = extractedBikeSize(deal);
  if (!label) return null;
  if (!deal.is_in_stock) return null;
  return {
    key: "Size",
    kind: "size",
    chips: [
      {
        label,
        minPrice: deal.current_price,
        maxPrice: deal.current_price,
      },
    ],
    hasPriceSpread: false,
  };
}

/** Variant-option chips, plus extracted bike_size when no in-stock size options exist. */
export function summarizeDealSizeChips(
  deal: Deal,
): InStockVariantChipSummary | null {
  const summary = summarizeInStockVariantChips(deal);
  if (summary?.sizes.length) return summary;
  const extracted = extractedSizeGroup(deal);
  if (!extracted) return summary;
  if (!summary) {
    return {
      inStockCount: 1,
      listedCount: 1,
      sizes: extracted.chips,
      colors: [],
      groups: [extracted],
      sizesHavePriceSpread: false,
      colorsHavePriceSpread: false,
    };
  }
  return {
    ...summary,
    sizes: extracted.chips,
    groups: [extracted, ...summary.groups],
    sizesHavePriceSpread: false,
  };
}

/** Compact cards: sizes if present, else colors, else the first remaining group. */
export function compactChipGroup(
  summary: InStockVariantChipSummary,
): VariantChipGroup | null {
  return (
    summary.groups.find((g) => g.kind === "size") ??
    summary.groups.find((g) => g.kind === "color") ??
    summary.groups[0] ??
    null
  );
}

export function limitChips(
  chips: VariantChip[],
  limit = COMPACT_CHIP_LIMIT,
): { visible: VariantChip[]; overflow: number } {
  if (chips.length <= limit) return { visible: chips, overflow: 0 };
  return { visible: chips.slice(0, limit), overflow: chips.length - limit };
}
