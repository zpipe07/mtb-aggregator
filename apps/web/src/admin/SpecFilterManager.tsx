"use client";

import { useState } from "react";
import {
  useSpecFilterConfigs,
  useSpecValueAliases,
  useSpecKeys,
} from "./hooks/queries";
import {
  useCreateSpecFilterConfig,
  useUpdateSpecFilterConfig,
  useDeleteSpecFilterConfig,
  useCreateSpecValueAlias,
  useUpdateSpecValueAlias,
  useDeleteSpecValueAlias,
  useTriggerRenormalizeSpecs,
} from "./hooks/mutations";
import type { SpecFilterConfig } from "./api";

function ConfigForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  initial: {
    spec_key: string;
    visible: boolean;
    merge_into: string;
    display_label: string;
    sort_order: number;
  };
  onSubmit: (body: {
    spec_key: string;
    visible: boolean;
    merge_into?: string | null;
    display_label?: string | null;
    sort_order: number;
  }) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
}) {
  const [specKey, setSpecKey] = useState(initial.spec_key);
  const [visible, setVisible] = useState(initial.visible);
  const [mergeInto, setMergeInto] = useState(initial.merge_into);
  const [displayLabel, setDisplayLabel] = useState(initial.display_label);
  const [sortOrder, setSortOrder] = useState(initial.sort_order);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!specKey.trim()) {
      setError("Spec key is required");
      return;
    }
    setBusy(true);
    try {
      await onSubmit({
        spec_key: specKey.trim(),
        visible,
        merge_into: mergeInto.trim() || null,
        display_label: displayLabel.trim() || null,
        sort_order: sortOrder,
      });
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
        <label htmlFor="spec-key" className="block text-sm font-medium text-stone-700 mb-1">
          Spec key
        </label>
        <input
          id="spec-key"
          type="text"
          value={specKey}
          onChange={(e) => setSpecKey(e.target.value)}
          placeholder="axle"
          className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
        />
      </div>
      <div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={visible}
            onChange={(e) => setVisible(e.target.checked)}
            className="rounded border-stone-300"
          />
          <span className="text-sm font-medium text-stone-700">Visible as filter</span>
        </label>
      </div>
      <div>
        <label htmlFor="merge-into" className="block text-sm font-medium text-stone-700 mb-1">
          Merge into (optional)
        </label>
        <input
          id="merge-into"
          type="text"
          value={mergeInto}
          onChange={(e) => setMergeInto(e.target.value)}
          placeholder="diameter"
          className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
        />
        <p className="text-xs text-stone-500 mt-1">Merge this key&apos;s values into another key&apos;s facet</p>
      </div>
      <div>
        <label htmlFor="display-label" className="block text-sm font-medium text-stone-700 mb-1">
          Display label (optional)
        </label>
        <input
          id="display-label"
          type="text"
          value={displayLabel}
          onChange={(e) => setDisplayLabel(e.target.value)}
          placeholder="Axle"
          className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
        />
      </div>
      <div>
        <label htmlFor="sort-order" className="block text-sm font-medium text-stone-700 mb-1">
          Sort order (higher = shown first)
        </label>
        <input
          id="sort-order"
          type="number"
          value={sortOrder}
          onChange={(e) => setSortOrder(Number(e.target.value))}
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

function ValueAliasForm({
  specKey,
  onSubmit,
  onCancel,
}: {
  specKey: string;
  onSubmit: (body: { spec_key: string; raw_value: string; display_value: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [rawValue, setRawValue] = useState("");
  const [displayValue, setDisplayValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!rawValue.trim() || !displayValue.trim()) {
      setError("Raw value and display value are required");
      return;
    }
    setBusy(true);
    try {
      await onSubmit({
        spec_key: specKey,
        raw_value: rawValue.trim(),
        display_value: displayValue.trim(),
      });
      setRawValue("");
      setDisplayValue("");
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
      <div className="flex gap-2 flex-wrap items-end">
        <div>
          <label htmlFor="raw-value" className="block text-xs font-medium text-stone-600 mb-1">
            Raw value
          </label>
          <input
            id="raw-value"
            type="text"
            value={rawValue}
            onChange={(e) => setRawValue(e.target.value)}
            placeholder="15x110mm BOOST™"
            className="rounded border border-stone-300 px-2 py-1.5 text-sm text-stone-900 w-40"
          />
        </div>
        <div>
          <label htmlFor="display-value" className="block text-xs font-medium text-stone-600 mb-1">
            Display value
          </label>
          <input
            id="display-value"
            type="text"
            value={displayValue}
            onChange={(e) => setDisplayValue(e.target.value)}
            placeholder="15x110mm Boost"
            className="rounded border border-stone-300 px-2 py-1.5 text-sm text-stone-900 w-40"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-stone-700 px-3 py-1.5 text-sm text-white hover:bg-stone-600 disabled:opacity-50"
        >
          {busy ? "Add…" : "Add alias"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50"
        >
          Done
        </button>
      </div>
    </form>
  );
}

export function SpecFilterManager() {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [addPrefillKey, setAddPrefillKey] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [addingAlias, setAddingAlias] = useState(false);

  const { data: configs = [], isPending: loadingConfigs, isError, error } = useSpecFilterConfigs();
  const { data: specKeys = [], isPending: loadingKeys } = useSpecKeys();
  const { data: aliases = [] } = useSpecValueAliases(selectedKey ?? undefined);

  const createConfig = useCreateSpecFilterConfig();
  const updateConfig = useUpdateSpecFilterConfig();
  const deleteConfig = useDeleteSpecFilterConfig();
  const createAlias = useCreateSpecValueAlias();
  const updateAlias = useUpdateSpecValueAlias();
  const deleteAlias = useDeleteSpecValueAlias();
  const renormalize = useTriggerRenormalizeSpecs();

  const configByKey = Object.fromEntries(configs.map((c) => [c.spec_key, c]));

  const displayError =
    createConfig.error?.message ??
    updateConfig.error?.message ??
    deleteConfig.error?.message ??
    createAlias.error?.message ??
    updateAlias.error?.message ??
    deleteAlias.error?.message ??
    renormalize.error?.message ??
    (isError ? error?.message ?? "Failed to load" : null);

  const renormalizeResult = renormalize.data?.updated ?? null;

  async function handleCreateConfig(body: {
    spec_key: string;
    visible: boolean;
    merge_into?: string | null;
    display_label?: string | null;
    sort_order: number;
  }) {
    await createConfig.mutateAsync(body);
    setAdding(false);
    setAddPrefillKey(null);
  }

  async function handleUpdateConfig(id: number, body: SpecFilterConfig) {
    await updateConfig.mutateAsync({
      id,
      body: {
        spec_key: body.spec_key,
        visible: body.visible,
        merge_into: body.merge_into,
        display_label: body.display_label,
        sort_order: body.sort_order,
      },
    });
    setEditingId(null);
  }

  function handleDeleteConfig(id: number) {
    if (!confirm("Delete this config?")) return;
    deleteConfig.mutate(id, {
      onSuccess: () => setEditingId(null),
    });
  }

  function handleRecategorize() {
    renormalize.mutate(undefined);
  }

  const getEmptyForm = () => ({
    spec_key: addPrefillKey ?? "",
    visible: true,
    merge_into: "",
    display_label: "",
    sort_order: 0,
  });

  return (
    <div>
      <div
        className="mb-4 rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        role="status"
      >
        <strong>Deprecated.</strong> Spec filters are now driven by LLM Prompt Profiles per category.
        Use{" "}
        <a href="/admin/llm-profiles" className="font-medium underline hover:text-amber-700">
          LLM Prompt Profiles
        </a>{" "}
        to control which specs appear as filters; add <code>label</code>, <code>sort_order</code>, and{" "}
        <code>filterable</code> to extraction schema fields. This page is retained for legacy PDP-based specs
        and may be removed in a future release.
      </div>
      <h2 className="text-xl font-semibold text-stone-800 mb-4">Spec filter normalization</h2>
      <p className="text-sm text-stone-600 mb-4">
        Control which spec keys appear as filters, merge duplicate keys (e.g. &quot;Available Diameters&quot; → &quot;Diameter&quot;),
        hide unwanted keys (e.g. &quot;Useful Links&quot;), and normalize duplicate values (e.g. &quot;15x110mm BOOST™&quot; → &quot;15x110mm Boost&quot;).
      </p>

      {displayError && (
        <div className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {displayError}
          <button
            type="button"
            onClick={() => {
              createConfig.reset();
              updateConfig.reset();
              deleteConfig.reset();
              createAlias.reset();
              updateAlias.reset();
              deleteAlias.reset();
              renormalize.reset();
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
            Add config
          </button>
        )}
        <button
          type="button"
          onClick={handleRecategorize}
          disabled={renormalize.isPending}
          className="rounded border border-stone-300 px-3 py-2 text-sm hover:bg-stone-50 disabled:opacity-50"
        >
          {renormalize.isPending ? "Re-normalizing…" : "Re-normalize key aliases"}
        </button>
        {renormalizeResult != null && (
          <span className="text-sm text-stone-600">{renormalizeResult} listings updated</span>
        )}
      </div>

      {adding && (
        <div className="mb-6 rounded-lg border border-stone-200 bg-stone-50 p-4">
          <h3 className="text-sm font-medium text-stone-700 mb-3">New spec filter config</h3>
          <ConfigForm
            initial={getEmptyForm()}
            onSubmit={handleCreateConfig}
            onCancel={() => {
              setAdding(false);
              setAddPrefillKey(null);
            }}
            submitLabel="Create"
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h3 className="text-sm font-semibold text-stone-700 mb-2">Discovered spec keys</h3>
          {loadingKeys ? (
            <p className="text-stone-600">Loading…</p>
          ) : (
            <div className="rounded-lg border border-stone-200 bg-white shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50">
                    <th className="px-4 py-2 text-left font-medium text-stone-600">Key</th>
                    <th className="px-4 py-2 text-right font-medium text-stone-600">Products</th>
                    <th className="px-4 py-2 text-left font-medium text-stone-600">Config</th>
                  </tr>
                </thead>
                <tbody>
                  {specKeys.map((k) => {
                    const cfg = configByKey[k.spec_key];
                    return (
                      <tr
                        key={k.spec_key}
                        className={`border-b border-stone-100 ${selectedKey === k.spec_key ? "bg-amber-50" : ""}`}
                      >
                        <td className="px-4 py-2">
                          <button
                            type="button"
                            onClick={() => setSelectedKey(selectedKey === k.spec_key ? null : k.spec_key)}
                            className="font-medium text-stone-800 hover:underline"
                          >
                            {k.spec_key}
                          </button>
                        </td>
                        <td className="px-4 py-2 text-right text-stone-600">{k.product_count}</td>
                        <td className="px-4 py-2 text-stone-600 text-xs">
                          {cfg ? (
                            <>
                              {cfg.visible ? "Visible" : "Hidden"}
                              {cfg.merge_into && ` → ${cfg.merge_into}`}
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {specKeys.length === 0 && (
                <p className="px-4 py-6 text-center text-stone-500">No spec keys found. Enrich listings to discover specs.</p>
              )}
            </div>
          )}
        </div>

        <div>
          <h3 className="text-sm font-semibold text-stone-700 mb-2">
            Spec filter config {configs.length > 0 && `(${configs.length})`}
          </h3>
          {loadingConfigs ? (
            <p className="text-stone-600">Loading…</p>
          ) : (
            <div className="rounded-lg border border-stone-200 bg-white shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50">
                    <th className="px-4 py-2 text-left font-medium text-stone-600">Key</th>
                    <th className="px-4 py-2 text-left font-medium text-stone-600">Visibility</th>
                    <th className="px-4 py-2 text-right font-medium text-stone-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {configs.map((c) => (
                    <tr key={c.id} className="border-b border-stone-100">
                      {editingId === c.id ? (
                        <td colSpan={3} className="px-4 py-3 bg-stone-50">
                          <ConfigForm
                            initial={{
                              spec_key: c.spec_key,
                              visible: c.visible,
                              merge_into: c.merge_into ?? "",
                              display_label: c.display_label ?? "",
                              sort_order: c.sort_order,
                            }}
                            onSubmit={(body) => handleUpdateConfig(c.id, { ...c, ...body })}
                            onCancel={() => setEditingId(null)}
                            submitLabel="Save"
                          />
                        </td>
                      ) : (
                        <>
                          <td className="px-4 py-2 font-medium text-stone-800">{c.spec_key}</td>
                          <td className="px-4 py-2 text-stone-600">
                            {c.visible ? "Visible" : "Hidden"}
                            {c.merge_into && ` (merge → ${c.merge_into})`}
                          </td>
                          <td className="px-4 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => setEditingId(c.id)}
                              className="text-stone-600 hover:text-stone-900 mr-2"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteConfig(c.id)}
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
              {configs.length === 0 && !adding && (
                <p className="px-4 py-6 text-center text-stone-500">No config. Add one or select a key above to manage.</p>
              )}
            </div>
          )}

          {selectedKey && (
            <div className="mt-6 rounded-lg border border-stone-200 bg-stone-50 p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-stone-700">
                  Value aliases for &quot;{selectedKey}&quot;
                </h3>
                {!configByKey[selectedKey] && (
                  <button
                    type="button"
                    onClick={() => {
                      setAddPrefillKey(selectedKey);
                      setAdding(true);
                    }}
                    className="text-sm text-stone-600 hover:text-stone-900 underline"
                  >
                    Add config for this key
                  </button>
                )}
              </div>
              <p className="text-xs text-stone-500 mb-3">
                Map raw values to a normalized display value. E.g. &quot;15x110mm BOOST™&quot; → &quot;15x110mm Boost&quot;
              </p>
              {addingAlias ? (
                <ValueAliasForm
                  specKey={selectedKey}
                  onSubmit={async (body) => {
                    await createAlias.mutateAsync(body);
                    setAddingAlias(false);
                  }}
                  onCancel={() => setAddingAlias(false)}
                />
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setAddingAlias(true)}
                    className="mb-3 rounded border border-stone-300 px-2 py-1 text-sm hover:bg-stone-100"
                  >
                    Add alias
                  </button>
                  {aliases.length > 0 ? (
                    <ul className="space-y-1 text-sm">
                      {aliases.map((a) => (
                        <li key={a.id} className="flex items-center justify-between">
                          <span className="text-stone-600">
                            <code className="bg-stone-200 px-1 rounded">{a.raw_value}</code> → {a.display_value}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm("Delete this alias?")) {
                                deleteAlias.mutate(a.id);
                              }
                            }}
                            className="text-red-600 hover:text-red-800 text-xs"
                          >
                            Delete
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-stone-500">No aliases for this key yet.</p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
