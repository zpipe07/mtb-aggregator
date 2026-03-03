import { useState } from "react";
import { useTaxonomyMappings } from "./hooks/queries";
import {
  useCreateTaxonomyMapping,
  useUpdateTaxonomyMapping,
  useDeleteTaxonomyMapping,
  useTriggerRecategorize,
} from "./hooks/mutations";

function MappingForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  initial: { canonical: string[]; raw_keywords: string[]; priority: number };
  onSubmit: (body: { canonical: string[]; raw_keywords: string[]; priority: number }) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
}) {
  const [canonicalStr, setCanonicalStr] = useState(initial.canonical.join(" > "));
  const [rawStr, setRawStr] = useState(initial.raw_keywords.join(", "));
  const [priority, setPriority] = useState(initial.priority);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const canonical = canonicalStr.split(">").map((s) => s.trim()).filter(Boolean);
    const raw_keywords = rawStr.split(",").map((s) => s.trim()).filter(Boolean);
    if (canonical.length === 0 || raw_keywords.length === 0) {
      setError("Canonical path and at least one raw keyword are required");
      return;
    }
    setBusy(true);
    try {
      await onSubmit({ canonical, raw_keywords, priority });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      <div>
        <label htmlFor="tax-canonical" className="block text-sm font-medium text-stone-700 mb-1">
          Canonical path (e.g. Components &gt; Brakes)
        </label>
        <input
          id="tax-canonical"
          type="text"
          value={canonicalStr}
          onChange={(e) => setCanonicalStr(e.target.value)}
          placeholder="Bikes > Mountain"
          className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
        />
      </div>
      <div>
        <label htmlFor="tax-raw" className="block text-sm font-medium text-stone-700 mb-1">
          Raw keywords (comma-separated; substring match)
        </label>
        <input
          id="tax-raw"
          type="text"
          value={rawStr}
          onChange={(e) => setRawStr(e.target.value)}
          placeholder="brake, brakes, disc brake, rotor"
          className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
        />
      </div>
      <div>
        <label htmlFor="tax-priority" className="block text-sm font-medium text-stone-700 mb-1">
          Priority (higher = matched first)
        </label>
        <input
          id="tax-priority"
          type="number"
          value={priority}
          onChange={(e) => setPriority(Number(e.target.value))}
          className="w-24 rounded border border-stone-300 px-3 py-2 text-stone-900"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-stone-700 px-3 py-2 text-sm text-white hover:bg-stone-600 disabled:opacity-50"
        >
          {busy ? "Saving…" : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-stone-300 px-3 py-2 text-sm hover:bg-stone-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function TaxonomyManager() {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [swapping, setSwapping] = useState(false);

  const { data: mappings = [], isPending: loading, isError, error } = useTaxonomyMappings();
  const sorted = [...mappings].sort((a, b) => b.priority - a.priority);
  const createMutation = useCreateTaxonomyMapping();
  const updateMutation = useUpdateTaxonomyMapping();
  const deleteMutation = useDeleteTaxonomyMapping();
  const recategorizeMutation = useTriggerRecategorize();

  const displayError =
    createMutation.error?.message ??
    updateMutation.error?.message ??
    deleteMutation.error?.message ??
    recategorizeMutation.error?.message ??
    (isError ? error?.message ?? "Failed to load" : null);

  const recategorizeResult = recategorizeMutation.data?.updated ?? null;

  async function handleCreate(body: { canonical: string[]; raw_keywords: string[]; priority: number }) {
    await createMutation.mutateAsync(body);
    setAdding(false);
  }

  async function handleUpdate(
    id: number,
    body: { canonical: string[]; raw_keywords: string[]; priority: number }
  ) {
    await updateMutation.mutateAsync({ id, body });
    setEditingId(null);
  }

  function handleDelete(id: number) {
    if (!confirm("Delete this mapping?")) return;
    deleteMutation.mutate(id, {
      onSuccess: () => setEditingId(null),
    });
  }

  function handleRecategorize() {
    recategorizeMutation.mutate(undefined);
  }

  async function handleSwapPriority(
    a: { id: number; canonical: string[]; raw_keywords: string[]; priority: number },
    b: { id: number; canonical: string[]; raw_keywords: string[]; priority: number }
  ) {
    setSwapping(true);
    try {
      await Promise.all([
        updateMutation.mutateAsync({
          id: a.id,
          body: { canonical: a.canonical, raw_keywords: a.raw_keywords, priority: b.priority },
        }),
        updateMutation.mutateAsync({
          id: b.id,
          body: { canonical: b.canonical, raw_keywords: b.raw_keywords, priority: a.priority },
        }),
      ]);
    } finally {
      setSwapping(false);
    }
  }

  const emptyForm = { canonical: [] as string[], raw_keywords: [] as string[], priority: 0 };

  return (
    <div>
      <h2 className="text-xl font-semibold text-stone-800 mb-4">Category taxonomy</h2>
      <p className="text-sm text-stone-600 mb-4">
        Mappings from store category paths to canonical categories. First matching rule wins (higher priority first).
      </p>

      {displayError && (
        <div className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {displayError}
          <button
            type="button"
            onClick={() => {
              createMutation.reset();
              updateMutation.reset();
              deleteMutation.reset();
              recategorizeMutation.reset();
            }}
            className="ml-2 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        {!adding && editingId == null && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded bg-stone-700 px-3 py-2 text-sm text-white hover:bg-stone-600"
          >
            Add mapping
          </button>
        )}
        <button
          type="button"
          onClick={handleRecategorize}
          disabled={recategorizeMutation.isPending}
          className="rounded border border-stone-300 px-3 py-2 text-sm hover:bg-stone-50 disabled:opacity-50"
        >
          {recategorizeMutation.isPending ? "Re-categorizing…" : "Re-categorize all listings"}
        </button>
        {recategorizeResult != null && (
          <span className="text-sm text-stone-600">{recategorizeResult} listings updated</span>
        )}
      </div>

      {adding && (
        <div className="mb-6 rounded-lg border border-stone-200 bg-stone-50 p-4">
          <h3 className="text-sm font-medium text-stone-700 mb-3">New mapping</h3>
          <MappingForm
            initial={emptyForm}
            onSubmit={handleCreate}
            onCancel={() => setAdding(false)}
            submitLabel="Create"
          />
        </div>
      )}

      {loading ? (
        <p className="text-stone-600">Loading…</p>
      ) : (
        <div className="rounded-lg border border-stone-200 bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50">
                <th className="px-4 py-2 text-left font-medium text-stone-600">Canonical</th>
                <th className="px-4 py-2 text-left font-medium text-stone-600">Raw keywords</th>
                <th className="px-4 py-2 text-right font-medium text-stone-600">Priority</th>
                <th className="px-4 py-2 text-right font-medium text-stone-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((m, i) => (
                <tr key={m.id} className="border-b border-stone-100">
                  {editingId === m.id ? (
                    <td colSpan={4} className="px-4 py-3 bg-stone-50">
                      <MappingForm
                        initial={{
                          canonical: m.canonical,
                          raw_keywords: m.raw_keywords,
                          priority: m.priority,
                        }}
                        onSubmit={(body) => handleUpdate(m.id, body)}
                        onCancel={() => setEditingId(null)}
                        submitLabel="Save"
                      />
                    </td>
                  ) : (
                    <>
                      <td className="px-4 py-2 font-medium text-stone-800">
                        {m.canonical.length ? m.canonical.join(" > ") : "—"}
                      </td>
                      <td className="px-4 py-2 text-stone-600 max-w-md">
                        <span className="truncate block" title={m.raw_keywords.join(", ")}>
                          {m.raw_keywords.join(", ")}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right text-stone-600">
                        <div className="inline-flex items-center gap-1 justify-end">
                          <button
                            type="button"
                            onClick={() => handleSwapPriority(sorted[i - 1], m)}
                            disabled={i === 0 || swapping}
                            className="text-stone-500 hover:text-stone-800 disabled:opacity-40 disabled:cursor-not-allowed"
                            aria-label="Move up"
                          >
                            ↑
                          </button>
                          <span>{m.priority}</span>
                          <button
                            type="button"
                            onClick={() => handleSwapPriority(m, sorted[i + 1])}
                            disabled={i === sorted.length - 1 || swapping}
                            className="text-stone-500 hover:text-stone-800 disabled:opacity-40 disabled:cursor-not-allowed"
                            aria-label="Move down"
                          >
                            ↓
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => setEditingId(m.id)}
                          className="text-stone-600 hover:text-stone-900 mr-2"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(m.id)}
                          className="text-red-600 hover:text-red-800"
                        >
                          Delete
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {mappings.length === 0 && !adding && (
            <p className="px-4 py-6 text-center text-stone-500">No mappings. Add one or run the API to seed from JSON.</p>
          )}
        </div>
      )}
    </div>
  );
}
