import { useState } from "react";
import { useAdminCategoryTree } from "./hooks/queries";
import {
  useCreateAdminCategory,
  useUpdateAdminCategory,
  useDeleteAdminCategory,
} from "./hooks/mutations";
import type { AdminCategoryTreeNode, CreateCategoryBody, UpdateCategoryBody } from "./api";

function CategoryForm({
  initial,
  parentId,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  initial?: { slug: string; name: string; sort_order: number };
  parentId?: number | null;
  onSubmit: (body: CreateCategoryBody) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
}) {
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [sortOrder, setSortOrder] = useState(initial?.sort_order ?? 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const s = slug.trim().toLowerCase().replace(/\s+/g, "-");
    const n = name.trim();
    if (!s || !n) {
      setError("Slug and name are required");
      return;
    }
    setBusy(true);
    try {
      await onSubmit({
        slug: s,
        name: n,
        parent_id: parentId ?? undefined,
        sort_order: sortOrder,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <label htmlFor="cat-name" className="block text-xs font-medium text-stone-500 mb-1">
            Name
          </label>
          <input
            id="cat-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Brakes"
            className="w-full rounded border border-stone-300 px-2 py-1.5 text-sm text-stone-900"
          />
        </div>
        <div className="flex-1">
          <label htmlFor="cat-slug" className="block text-xs font-medium text-stone-500 mb-1">
            Slug
          </label>
          <input
            id="cat-slug"
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="e.g. brakes"
            className="w-full rounded border border-stone-300 px-2 py-1.5 text-sm text-stone-900"
          />
        </div>
        <div className="w-16">
          <label htmlFor="cat-sort" className="block text-xs font-medium text-stone-500 mb-1">
            Order
          </label>
          <input
            id="cat-sort"
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value))}
            className="w-full rounded border border-stone-300 px-2 py-1.5 text-sm text-stone-900"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-stone-700 px-3 py-2 text-sm text-white hover:bg-stone-600 disabled:opacity-50"
        >
          {busy ? "…" : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-stone-300 px-3 py-2 text-sm text-stone-700 hover:bg-stone-100"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function CategoryRow({
  node,
  depth,
  onAddChild,
  onEdit,
  onUpdate,
  onAddChildSubmit,
  onDelete,
  editingId,
  setEditingId,
  addingUnderId,
  setAddingUnderId,
}: {
  node: AdminCategoryTreeNode;
  depth: number;
  onAddChild: (parentId: number) => void;
  onEdit: (node: AdminCategoryTreeNode) => void;
  onUpdate: (id: number, body: UpdateCategoryBody) => Promise<void>;
  onAddChildSubmit: (body: CreateCategoryBody) => Promise<void>;
  onDelete: (node: AdminCategoryTreeNode) => void;
  editingId: number | null;
  setEditingId: (id: number | null) => void;
  addingUnderId: number | null;
  setAddingUnderId: (id: number | null) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children && node.children.length > 0;
  const isEditing = editingId === node.id;
  const isAddingChild = addingUnderId === node.id;
  const indent = depth * 20;

  return (
    <div className="mb-1" style={{ marginLeft: indent }}>
      <div className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-stone-100 group">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="w-5 h-5 shrink-0 text-stone-400 hover:text-stone-600 flex items-center justify-center"
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          {hasChildren ? (expanded ? "−" : "+") : "·"}
        </button>
        <span className="text-sm font-medium text-stone-800 min-w-0 truncate">
          {node.name}
        </span>
        <span className="text-xs text-stone-400 truncate">/{node.slug}</span>
        <span className="text-xs text-stone-400">#{node.id}</span>
        <div className="ml-auto flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={() => onAddChild(node.id)}
            className="text-xs text-stone-500 hover:text-stone-700"
          >
            + child
          </button>
          <button
            type="button"
            onClick={() => onEdit(node)}
            className="text-xs text-stone-500 hover:text-stone-700"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => onDelete(node)}
            className="text-xs text-red-600 hover:text-red-700"
          >
            Delete
          </button>
        </div>
      </div>
      {isEditing && (
        <div className="ml-7 mt-2 mb-2 p-3 bg-stone-50 rounded border border-stone-200">
          <CategoryForm
            initial={{ slug: node.slug, name: node.name, sort_order: node.sort_order }}
            onSubmit={async (body) => {
              await onUpdate(node.id, {
                slug: body.slug,
                name: body.name,
                sort_order: body.sort_order,
              });
              setEditingId(null);
            }}
            onCancel={() => setEditingId(null)}
            submitLabel="Update"
          />
        </div>
      )}
      {isAddingChild && (
        <div className="ml-7 mt-2 mb-2 p-3 bg-stone-50 rounded border border-stone-200">
          <CategoryForm
            parentId={node.id}
            onSubmit={async (body) => {
              await onAddChildSubmit(body);
              setAddingUnderId(null);
            }}
            onCancel={() => setAddingUnderId(null)}
            submitLabel="Add"
          />
        </div>
      )}
      {expanded && hasChildren && (
        <div className="mt-0">
          {node.children!.map((child) => (
            <CategoryRow
              key={child.id}
              node={child}
              depth={depth + 1}
              onAddChild={onAddChild}
              onEdit={onEdit}
              onUpdate={onUpdate}
              onAddChildSubmit={onAddChildSubmit}
              onDelete={onDelete}
              editingId={editingId}
              setEditingId={setEditingId}
              addingUnderId={addingUnderId}
              setAddingUnderId={setAddingUnderId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function CategoryManager() {
  const { data: tree, isLoading, error } = useAdminCategoryTree();
  const createMut = useCreateAdminCategory();
  const updateMut = useUpdateAdminCategory();
  const deleteMut = useDeleteAdminCategory();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [addingUnderId, setAddingUnderId] = useState<number | null>(null);
  const [addingRoot, setAddingRoot] = useState(false);

  function handleAddChild(parentId: number) {
    setAddingUnderId(parentId);
    setEditingId(null);
  }

  function handleEdit(node: AdminCategoryTreeNode) {
    setEditingId(node.id);
    setAddingUnderId(null);
    setAddingRoot(false);
  }

  async function handleUpdate(id: number, body: UpdateCategoryBody) {
    await updateMut.mutateAsync({ id, body });
    setEditingId(null);
  }

  async function handleAddChildSubmit(body: CreateCategoryBody) {
    await createMut.mutateAsync(body);
    setAddingUnderId(null);
  }

  async function handleDelete(node: AdminCategoryTreeNode) {
    if (!confirm(`Delete "${node.name}" (${node.slug})? This may fail if it has children or is in use.`)) return;
    try {
      await deleteMut.mutateAsync(node.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function handleCreateSubmit(body: CreateCategoryBody) {
    await createMut.mutateAsync(body);
    setAddingRoot(false);
  }

  if (isLoading) return <p className="text-stone-500">Loading categories…</p>;
  if (error) return <p className="text-red-600">Failed to load categories.</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-stone-800">Category Tree</h2>
        <button
          type="button"
          onClick={() => {
            setAddingRoot(true);
            setAddingUnderId(null);
            setEditingId(null);
          }}
          className="rounded bg-stone-700 px-3 py-2 text-sm text-white hover:bg-stone-600"
        >
          Add root category
        </button>
      </div>
      <p className="text-sm text-stone-600">
        Manage the structured category tree used for deals filtering. Slug is used in URLs (e.g. <code className="bg-stone-200 px-1 rounded">/deals?category=brakes</code>).
      </p>
      {addingRoot && (
        <div className="p-4 bg-stone-50 rounded border border-stone-200">
          <CategoryForm
            parentId={null}
            onSubmit={handleCreateSubmit}
            onCancel={() => setAddingRoot(false)}
            submitLabel="Add"
          />
        </div>
      )}
      <div className="border border-stone-200 rounded-lg p-4 bg-white">
        {tree && tree.length > 0 ? (
          tree.map((node) => (
            <CategoryRow
              key={node.id}
              node={node}
              depth={0}
              onAddChild={handleAddChild}
              onEdit={handleEdit}
              onUpdate={handleUpdate}
              onAddChildSubmit={handleAddChildSubmit}
              onDelete={handleDelete}
              editingId={editingId}
              setEditingId={setEditingId}
              addingUnderId={addingUnderId}
              setAddingUnderId={setAddingUnderId}
            />
          ))
        ) : (
          <p className="text-stone-500 text-sm">No categories yet. Add a root category to get started.</p>
        )}
      </div>
    </div>
  );
}
