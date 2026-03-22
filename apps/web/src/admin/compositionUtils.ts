import type { LLMExtractionFieldDef, LLMProfileFieldInput, LLMProfileFieldRow } from "./api";

/** Editable row for the profile composition UI. */
export type CompositionRow = {
  id?: number;
  field_def_id: number | null;
  field_key?: string | null;
  sort_order: number;
  overrides: Record<string, unknown>;
  inline_field?: Record<string, unknown>;
};

function normalizeOverrides(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

export function rowsFromApi(pfs: LLMProfileFieldRow[]): CompositionRow[] {
  return pfs.map((pf) => ({
    id: pf.id,
    field_def_id: pf.field_def_id ?? null,
    field_key: pf.field_key ?? null,
    sort_order: pf.sort_order,
    overrides: normalizeOverrides(pf.overrides),
    inline_field: pf.inline_field,
  }));
}

/**
 * Build composition rows from a legacy extraction_schema by matching field keys to library defs;
 * unmatched fields become inline_field rows. Skips "confidence" (hydrated server-side).
 */
export function legacyFieldsToComposition(
  extraction_schema: Record<string, unknown>,
  defs: LLMExtractionFieldDef[]
): CompositionRow[] {
  const fields = extraction_schema.fields;
  if (!Array.isArray(fields)) return [];
  const byKey = new Map(defs.map((d) => [d.field_key, d]));
  let order = 0;
  const out: CompositionRow[] = [];
  for (const f of fields) {
    if (!f || typeof f !== "object") continue;
    const key = (f as { key?: string }).key;
    if (key === "confidence") continue;
    const def = key ? byKey.get(key) : undefined;
    if (def) {
      out.push({
        field_def_id: def.id,
        field_key: def.field_key,
        sort_order: order++,
        overrides: {},
      });
    } else {
      out.push({
        field_def_id: null,
        sort_order: order++,
        overrides: {},
        inline_field: f as Record<string, unknown>,
      });
    }
  }
  return out;
}

export function rowsToProfileFieldInput(rows: CompositionRow[]): LLMProfileFieldInput[] {
  return rows.map((r, i) => {
    const hasInline = !!(r.inline_field && Object.keys(r.inline_field).length > 0);
    const base: LLMProfileFieldInput = {
      sort_order: i,
      overrides: Object.keys(r.overrides).length > 0 ? r.overrides : {},
    };
    if (hasInline) {
      return { ...base, field_def_id: null, inline_field: r.inline_field! };
    }
    return { ...base, field_def_id: r.field_def_id ?? undefined };
  });
}

export function rowLabel(row: CompositionRow, defs: LLMExtractionFieldDef[]): string {
  if (row.inline_field && typeof row.inline_field.key === "string") {
    return `${String(row.inline_field.key)} (custom)`;
  }
  if (row.field_key) return row.field_key;
  const d = defs.find((x) => x.id === row.field_def_id);
  return d ? d.field_key : `def #${row.field_def_id ?? "?"}`;
}
