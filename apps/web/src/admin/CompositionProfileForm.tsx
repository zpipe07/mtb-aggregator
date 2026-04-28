"use client";

import { useId, useState } from "react";
import type { LLMPromptProfile, LLMExtractionFieldDef } from "./api";
import { CategoryPicker } from "./CategoryPicker";
import type { CompositionRow } from "./compositionUtils";
import { rowLabel, rowsToProfileFieldInput } from "./compositionUtils";

export function CompositionProfileForm({
  detail,
  defs,
  initialRows,
  onSave,
  onCancel,
}: {
  detail: LLMPromptProfile;
  defs: LLMExtractionFieldDef[];
  initialRows: CompositionRow[];
  onSave: (body: {
    canonical_category: string[];
    name: string;
    system_prompt: string;
    enabled: boolean;
    profile_fields: ReturnType<typeof rowsToProfileFieldInput>;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const [canonicalCategory, setCanonicalCategory] = useState<string[]>(detail.canonical_category);
  const [name, setName] = useState(detail.name);
  const [systemPrompt, setSystemPrompt] = useState(detail.system_prompt);
  const [enabled, setEnabled] = useState(detail.enabled);
  const [rows, setRows] = useState<CompositionRow[]>(initialRows);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [addDefId, setAddDefId] = useState<string>("");
  const [overridesIdx, setOverridesIdx] = useState<number | null>(null);
  const [overridesStr, setOverridesStr] = useState("{}");
  const [customOpen, setCustomOpen] = useState(false);
  const [customStr, setCustomStr] = useState(
    JSON.stringify(
      {
        key: "my_field",
        type: "string",
        description: "Description for the model",
        label: "My field",
        sort_order: 0,
      },
      null,
      2
    )
  );

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    setRows((prev) => {
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function removeAt(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  function addFromLibrary() {
    const id = parseInt(addDefId, 10);
    if (!Number.isFinite(id)) return;
    const def = defs.find((d) => d.id === id);
    if (!def) return;
    setRows((prev) => [
      ...prev,
      {
        field_def_id: def.id,
        field_key: def.field_key,
        sort_order: prev.length,
        overrides: {},
      },
    ]);
    setAddDefId("");
  }

  function openOverrides(i: number) {
    setOverridesIdx(i);
    setOverridesStr(JSON.stringify(rows[i]?.overrides ?? {}, null, 2));
  }

  function saveOverrides() {
    if (overridesIdx === null) return;
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(overridesStr) as Record<string, unknown>;
    } catch {
      setError("Invalid overrides JSON");
      return;
    }
    setError(null);
    setRows((prev) => {
      const next = [...prev];
      const r = next[overridesIdx];
      if (r) next[overridesIdx] = { ...r, overrides: parsed };
      return next;
    });
    setOverridesIdx(null);
  }

  function addCustom() {
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(customStr) as Record<string, unknown>;
    } catch {
      setError("Invalid JSON for custom field");
      return;
    }
    if (typeof obj.key !== "string" || typeof obj.type !== "string" || typeof obj.description !== "string") {
      setError("Custom field JSON must include key, type, and description");
      return;
    }
    setError(null);
    setRows((prev) => [
      ...prev,
      { field_def_id: null, sort_order: prev.length, overrides: {}, inline_field: obj },
    ]);
    setCustomOpen(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (canonicalCategory.length === 0 || !name.trim() || !systemPrompt.trim()) {
      setError("Canonical category, name, and system prompt are required");
      return;
    }
    setBusy(true);
    try {
      await onSave({
        canonical_category: canonicalCategory,
        name: name.trim(),
        system_prompt: systemPrompt.trim(),
        enabled,
        profile_fields: rowsToProfileFieldInput(rows),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  const preview = JSON.stringify(detail.extraction_schema, null, 2);

  const compControlIds = useId();
  const cc = (s: string) => `${compControlIds}-${s}`;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      <div>
        <CategoryPicker
          id="comp-profile-category"
          label="Canonical category"
          value={canonicalCategory}
          onChange={setCanonicalCategory}
        />
      </div>
      <div>
        <label htmlFor="comp-profile-name" className="block text-sm font-medium text-stone-700 mb-1">
          Name
        </label>
        <input
          id="comp-profile-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
        />
      </div>
      <div>
        <label htmlFor="comp-profile-prompt" className="block text-sm font-medium text-stone-700 mb-1">
          System prompt
        </label>
        <textarea
          id="comp-profile-prompt"
          rows={4}
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          className="w-full rounded border border-stone-300 px-3 py-2 font-mono text-sm text-stone-900"
        />
      </div>

      <div className="rounded border border-stone-200 bg-stone-50 p-3">
        <p className="mb-2 text-sm font-medium text-stone-800">Composition</p>
        <p className="mb-2 text-xs text-stone-600">
          Order matters. <code className="rounded bg-stone-200 px-0.5">confidence</code> is appended by
          the server unless you include it in the library list. Use overrides for per-profile enum subsets
          or label tweaks.
        </p>
        <ul className="space-y-2">
          {rows.map((row, i) => (
            <li
              key={row.id != null ? `row-${row.id}` : `row-${i}-${rowLabel(row, defs)}`}
              className="flex flex-wrap items-center gap-2 rounded border border-stone-200 bg-white px-2 py-2 text-sm"
            >
              <span className="font-mono text-xs text-stone-800">
                {i + 1}. {rowLabel(row, defs)}
              </span>
              <button type="button" className="text-xs underline" onClick={() => move(i, -1)} disabled={i === 0}>
                Up
              </button>
              <button
                type="button"
                className="text-xs underline"
                onClick={() => move(i, 1)}
                disabled={i === rows.length - 1}
              >
                Down
              </button>
              <button type="button" className="text-xs text-red-700 underline" onClick={() => removeAt(i)}>
                Remove
              </button>
              <button type="button" className="text-xs underline" onClick={() => openOverrides(i)}>
                Overrides
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor={cc("add-library")} className="block text-xs text-stone-600">
              Add from library
            </label>
            <select
              id={cc("add-library")}
              value={addDefId}
              onChange={(e) => setAddDefId(e.target.value)}
              className="rounded border border-stone-300 px-2 py-1.5 font-mono text-xs"
            >
              <option value="">—</option>
              {defs.map((d) => (
                <option key={d.id} value={String(d.id)}>
                  {d.field_key} ({d.field_type})
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={addFromLibrary}
            disabled={!addDefId}
            className="rounded border border-stone-300 px-2 py-1.5 text-xs hover:bg-stone-50"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => setCustomOpen(true)}
            className="rounded border border-stone-300 px-2 py-1.5 text-xs hover:bg-stone-50"
          >
            Add custom (inline JSON)
          </button>
        </div>
      </div>

      <div>
        <p className="mb-1 text-sm font-medium text-stone-700">Hydrated schema preview (read-only)</p>
        <pre className="max-h-48 overflow-auto rounded border border-stone-200 bg-stone-50 p-2 text-xs text-stone-800">
          {preview}
        </pre>
        <p className="mt-1 text-xs text-stone-500">Updates after save when you reload the profile.</p>
      </div>

      <div className="flex items-center gap-2">
        <input
          id="comp-profile-enabled"
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="rounded border-stone-300"
        />
        <label htmlFor="comp-profile-enabled" className="text-sm text-stone-700">
          Enabled
        </label>
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-stone-700 px-3 py-2 text-sm text-white hover:bg-stone-600 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-stone-300 px-3 py-2 text-sm hover:bg-stone-50"
        >
          Cancel
        </button>
      </div>

      {overridesIdx !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4"
          role="dialog"
        >
          <div className="w-full max-w-lg rounded bg-white p-4 shadow-lg">
            <h4 className="mb-2 font-medium text-stone-900">Overrides (JSON object)</h4>
            <p className="mb-2 text-xs text-stone-600">
              Shallow merge over the library def: label, description, values, filterable, type.
            </p>
            <label htmlFor={cc("overrides-json")} className="sr-only">
              Overrides JSON object
            </label>
            <textarea
              id={cc("overrides-json")}
              value={overridesStr}
              onChange={(e) => setOverridesStr(e.target.value)}
              rows={8}
              className="w-full rounded border border-stone-300 font-mono text-xs"
              spellCheck={false}
            />
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={saveOverrides}
                className="rounded bg-stone-700 px-3 py-1.5 text-sm text-white"
              >
                Apply
              </button>
              <button type="button" onClick={() => setOverridesIdx(null)} className="rounded border px-3 py-1.5 text-sm">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {customOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4"
          role="dialog"
        >
          <div className="w-full max-w-lg rounded bg-white p-4 shadow-lg">
            <h4 className="mb-2 font-medium text-stone-900">Custom field (full SchemaField JSON)</h4>
            <label htmlFor={cc("custom-field-json")} className="sr-only">
              Custom field JSON
            </label>
            <textarea
              id={cc("custom-field-json")}
              value={customStr}
              onChange={(e) => setCustomStr(e.target.value)}
              rows={12}
              className="w-full rounded border border-stone-300 font-mono text-xs"
              spellCheck={false}
            />
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={addCustom} className="rounded bg-stone-700 px-3 py-1.5 text-sm text-white">
                Add
              </button>
              <button
                type="button"
                onClick={() => setCustomOpen(false)}
                className="rounded border px-3 py-1.5 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
