import { useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTaxonomyMappings } from "./hooks/queries";
import {
  useCreateTaxonomyMapping,
  useUpdateTaxonomyMapping,
  useDeleteTaxonomyMapping,
  useReorderTaxonomyMappings,
  useTriggerRecategorize,
} from "./hooks/mutations";
import type { CategoryMapping } from "./api";

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

function SortableRow({
  m,
  editingId,
  onEdit,
  onDelete,
  renderForm,
}: {
  m: CategoryMapping;
  editingId: number | null;
  onEdit: () => void;
  onDelete: () => void;
  renderForm: () => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: m.id,
    disabled: editingId !== null,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`border-b border-stone-100 ${isDragging ? "bg-stone-100 opacity-80" : ""}`}
    >
      {editingId === m.id ? (
        <td colSpan={5} className="px-4 py-3 bg-stone-50">
          {renderForm()}
        </td>
      ) : (
        <>
          <td className="w-10 px-2 py-2">
            <button
              type="button"
              className="cursor-grab touch-none p-1 text-stone-400 hover:text-stone-600 active:cursor-grabbing"
              aria-label="Drag to reorder"
              {...attributes}
              {...listeners}
            >
              <span className="inline-block" aria-hidden>⋮⋮</span>
            </button>
          </td>
          <td className="px-4 py-2 font-medium text-stone-800">
            {m.canonical.length ? m.canonical.join(" > ") : "—"}
          </td>
          <td className="px-4 py-2 text-stone-600 max-w-md">
            <span className="truncate block" title={m.raw_keywords.join(", ")}>
              {m.raw_keywords.join(", ")}
            </span>
          </td>
          <td className="px-4 py-2 text-right text-stone-600">{m.priority}</td>
          <td className="px-4 py-2 text-right">
            <button type="button" onClick={onEdit} className="text-stone-600 hover:text-stone-900 mr-2">
              Edit
            </button>
            <button type="button" onClick={onDelete} className="text-red-600 hover:text-red-800">
              Delete
            </button>
          </td>
        </>
      )}
    </tr>
  );
}

export function TaxonomyManager() {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);

  const { data: mappings = [], isPending: loading, isError, error } = useTaxonomyMappings();
  const sorted = [...mappings].sort((a, b) => b.priority - a.priority);
  const createMutation = useCreateTaxonomyMapping();
  const updateMutation = useUpdateTaxonomyMapping();
  const deleteMutation = useDeleteTaxonomyMapping();
  const reorderMutation = useReorderTaxonomyMappings();
  const recategorizeMutation = useTriggerRecategorize();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const displayError =
    createMutation.error?.message ??
    updateMutation.error?.message ??
    deleteMutation.error?.message ??
    reorderMutation.error?.message ??
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

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sorted.findIndex((m) => m.id === active.id);
    const newIndex = sorted.findIndex((m) => m.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(sorted, oldIndex, newIndex);
    const updates = reordered.map((m, i) => ({
      id: m.id,
      priority: reordered.length - 1 - i,
    }));
    reorderMutation.mutate(updates);
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
              reorderMutation.reset();
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
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50">
                <th className="w-10 px-2 py-2" aria-label="Drag handle" />
                <th className="px-4 py-2 text-left font-medium text-stone-600">Canonical</th>
                <th className="px-4 py-2 text-left font-medium text-stone-600">Raw keywords</th>
                <th className="px-4 py-2 text-right font-medium text-stone-600">Priority</th>
                <th className="px-4 py-2 text-right font-medium text-stone-600">Actions</th>
              </tr>
            </thead>
            <SortableContext items={sorted.map((m) => m.id)} strategy={verticalListSortingStrategy}>
              <tbody>
                {sorted.map((m) => (
                  <SortableRow
                    key={m.id}
                    m={m}
                    editingId={editingId}
                    onEdit={() => setEditingId(m.id)}
                    onDelete={() => handleDelete(m.id)}
                    renderForm={() => (
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
                      )}
                    />
                  ))}
              </tbody>
            </SortableContext>
          </table>
          </DndContext>
          {mappings.length === 0 && !adding && (
            <p className="px-4 py-6 text-center text-stone-500">No mappings. Add one or run the API to seed from JSON.</p>
          )}
        </div>
      )}
    </div>
  );
}
