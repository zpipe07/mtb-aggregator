"use client";

import { useId, useState } from "react";
import { useLLMExtractionFieldDefs } from "./hooks/queries";
import {
  useCreateLLMExtractionFieldDef,
  useUpdateLLMExtractionFieldDef,
  useDeleteLLMExtractionFieldDef,
} from "./hooks/mutations";
import type { LLMExtractionFieldDef } from "./api";

const FIELD_TYPES = ["string", "integer", "number", "enum", "multi_enum"] as const;

function DefModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: LLMExtractionFieldDef | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const createMut = useCreateLLMExtractionFieldDef();
  const updateMut = useUpdateLLMExtractionFieldDef();
  const [fieldKey, setFieldKey] = useState(initial?.field_key ?? "");
  const [fieldType, setFieldType] = useState(initial?.field_type ?? "string");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [label, setLabel] = useState(initial?.label ?? "");
  const [valuesStr, setValuesStr] = useState(
    initial?.values != null ? JSON.stringify(initial.values, null, 2) : ""
  );
  const [filterable, setFilterable] = useState<"" | "true" | "false">(
    initial?.filterable === null || initial?.filterable === undefined
      ? ""
      : initial.filterable
        ? "true"
        : "false"
  );
  const [error, setError] = useState<string | null>(null);
  const busy = createMut.isPending || updateMut.isPending;
  const fieldIds = useId();
  const fk = (s: string) => `${fieldIds}-${s}`;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!fieldKey.trim() || !description.trim()) {
      setError("field_key and description are required");
      return;
    }
    let values: unknown = null;
    if (valuesStr.trim()) {
      try {
        values = JSON.parse(valuesStr);
      } catch {
        setError("Invalid JSON for values (use a JSON array for enums)");
        return;
      }
    }
    const filterableVal =
      filterable === "" ? null : filterable === "true" ? true : false;
    try {
      if (initial) {
        await updateMut.mutateAsync({
          id: initial.id,
          body: {
            field_key: fieldKey.trim(),
            field_type: fieldType,
            description: description.trim(),
            label: label.trim() || null,
            values,
            filterable: filterableVal,
          },
        });
      } else {
        await createMut.mutateAsync({
          field_key: fieldKey.trim(),
          field_type: fieldType,
          description: description.trim(),
          label: label.trim() || null,
          values,
          filterable: filterableVal,
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-lg rounded-lg border border-stone-200 bg-white p-4 shadow-lg">
        <h3 className="mb-3 font-semibold text-stone-900">
          {initial ? "Edit field definition" : "New field definition"}
        </h3>
        {error && (
          <p className="mb-2 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor={fk("field-key")} className="block text-xs font-medium text-stone-600">
              field_key
            </label>
            <input
              id={fk("field-key")}
              value={fieldKey}
              onChange={(e) => setFieldKey(e.target.value)}
              disabled={!!initial}
              className="mt-0.5 w-full rounded border border-stone-300 px-2 py-1.5 font-mono text-sm disabled:bg-stone-100"
              required
            />
            {initial && (
              <p className="mt-0.5 text-xs text-stone-500">Key cannot be changed after creation.</p>
            )}
          </div>
          <div>
            <label htmlFor={fk("field-type")} className="block text-xs font-medium text-stone-600">
              field_type
            </label>
            <select
              id={fk("field-type")}
              value={fieldType}
              onChange={(e) => setFieldType(e.target.value)}
              className="mt-0.5 w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
            >
              {FIELD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={fk("description")} className="block text-xs font-medium text-stone-600">
              description
            </label>
            <textarea
              id={fk("description")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="mt-0.5 w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
              required
            />
          </div>
          <div>
            <label htmlFor={fk("label-opt")} className="block text-xs font-medium text-stone-600">
              label (optional)
            </label>
            <input
              id={fk("label-opt")}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="mt-0.5 w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label htmlFor={fk("values-json")} className="block text-xs font-medium text-stone-600">
              values (JSON array for enum / multi_enum, optional)
            </label>
            <textarea
              id={fk("values-json")}
              value={valuesStr}
              onChange={(e) => setValuesStr(e.target.value)}
              rows={4}
              placeholder='["29", "27.5"]'
              className="mt-0.5 w-full rounded border border-stone-300 px-2 py-1.5 font-mono text-xs"
              spellCheck={false}
            />
          </div>
          <div>
            <label htmlFor={fk("filterable")} className="block text-xs font-medium text-stone-600">
              filterable
            </label>
            <select
              id={fk("filterable")}
              value={filterable}
              onChange={(e) => setFilterable(e.target.value as "" | "true" | "false")}
              className="mt-0.5 w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
            >
              <option value="">Default (true)</option>
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded bg-stone-700 px-3 py-1.5 text-sm text-white hover:bg-stone-600 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={onClose} className="rounded border border-stone-300 px-3 py-1.5 text-sm">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ExtractionFieldLibraryPanel() {
  const defSearchInputId = useId();
  const [q, setQ] = useState("");
  const { data: defs, isLoading, isError, error } = useLLMExtractionFieldDefs(q);
  const deleteMut = useDeleteLLMExtractionFieldDef();
  const [modal, setModal] = useState<LLMExtractionFieldDef | null | "new">(null);

  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-600">
        Global extraction field templates. Prompt profiles reference these by id and can override per-profile
        labels, enum values, etc.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={defSearchInputId} className="sr-only">
          Search definitions
        </label>
        <input
          id={defSearchInputId}
          type="search"
          placeholder="Search key or label…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="rounded border border-stone-300 px-3 py-1.5 text-sm"
        />
        <button
          type="button"
          onClick={() => setModal("new")}
          className="rounded bg-stone-700 px-3 py-1.5 text-sm text-white hover:bg-stone-600"
        >
          New definition
        </button>
      </div>

      {isLoading && <p className="text-sm text-stone-500">Loading…</p>}
      {isError && (
        <p className="text-sm text-red-600" role="alert">
          {error instanceof Error ? error.message : "Failed to load field definitions"}
        </p>
      )}

      <div className="overflow-x-auto rounded border border-stone-200">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 bg-stone-50">
              <th className="px-3 py-2 text-left font-medium text-stone-700">field_key</th>
              <th className="px-3 py-2 text-left font-medium text-stone-700">type</th>
              <th className="px-3 py-2 text-left font-medium text-stone-700">label</th>
              <th className="px-3 py-2 text-right font-medium text-stone-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(defs ?? []).map((d) => (
              <tr key={d.id} className="border-b border-stone-100">
                <td className="px-3 py-2 font-mono text-xs text-stone-900">{d.field_key}</td>
                <td className="px-3 py-2 text-stone-700">{d.field_type}</td>
                <td className="px-3 py-2 text-stone-600">{d.label ?? "—"}</td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => setModal(d)}
                    className="mr-2 text-xs text-stone-700 underline"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!confirm(`Delete "${d.field_key}"?`)) return;
                      try {
                        await deleteMut.mutateAsync(d.id);
                      } catch (e) {
                        alert(e instanceof Error ? e.message : "Delete failed");
                      }
                    }}
                    className="text-xs text-red-700 underline"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(defs?.length ?? 0) === 0 && !isLoading && !isError && (
        <p className="text-sm text-stone-500">No definitions match.</p>
      )}

      {modal === "new" && (
        <DefModal
          initial={null}
          onClose={() => setModal(null)}
          onSaved={() => setModal(null)}
        />
      )}
      {modal !== null && modal !== "new" && (
        <DefModal
          initial={modal}
          onClose={() => setModal(null)}
          onSaved={() => setModal(null)}
        />
      )}
    </div>
  );
}
