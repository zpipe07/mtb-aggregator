import { useState } from "react";
import { Link } from "react-router-dom";
import {
  useUnmappedItems,
  useSpecNormalizationRules,
  useSpecKeyAliases,
  useLLMProfiles,
} from "./hooks/queries";
import {
  useCreateSpecNormalizationRule,
  useUpdateSpecNormalizationRule,
  useDeleteSpecNormalizationRule,
  useCreateSpecKeyAlias,
  useUpdateSpecKeyAlias,
  useDeleteSpecKeyAlias,
  useTriggerRenormalizeSpecs,
  useRunLLMExtractionForCategory,
} from "./hooks/mutations";
import type { SpecNormalizationRule, SpecKeyAlias } from "./api";

const RULE_TYPES = ["unit_normalize", "value_map", "regex_replace", "case_normalize"] as const;

function RuleForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  initial: { spec_key: string; rule_type: string; config: Record<string, unknown>; priority: number };
  onSubmit: (body: {
    spec_key: string;
    rule_type: string;
    config: Record<string, unknown>;
    priority: number;
  }) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
}) {
  const [specKey, setSpecKey] = useState(initial.spec_key);
  const [ruleType, setRuleType] = useState(initial.rule_type);
  const [configStr, setConfigStr] = useState(JSON.stringify(initial.config, null, 2));
  const [priority, setPriority] = useState(initial.priority);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    let config: Record<string, unknown>;
    try {
      config = JSON.parse(configStr);
    } catch {
      setError("Invalid JSON in config");
      return;
    }
    setBusy(true);
    try {
      await onSubmit({ spec_key: specKey.trim(), rule_type: ruleType, config, priority });
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
        <label htmlFor="rule-spec-key" className="block text-sm font-medium text-stone-700 mb-1">
          Spec key
        </label>
        <input
          id="rule-spec-key"
          type="text"
          value={specKey}
          onChange={(e) => setSpecKey(e.target.value)}
          placeholder="hub_spacing"
          className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
        />
      </div>
      <div>
        <label htmlFor="rule-type" className="block text-sm font-medium text-stone-700 mb-1">
          Rule type
        </label>
        <select
          id="rule-type"
          value={ruleType}
          onChange={(e) => setRuleType(e.target.value)}
          className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
        >
          {RULE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="rule-config" className="block text-sm font-medium text-stone-700 mb-1">
          Config (JSON)
        </label>
        <textarea
          id="rule-config"
          value={configStr}
          onChange={(e) => setConfigStr(e.target.value)}
          rows={4}
          placeholder='{"unit": "mm", "strip_trademark": true}'
          className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900 font-mono text-sm"
        />
        <p className="text-xs text-stone-500 mt-1">
          unit_normalize: {"{ \"unit\": \"mm\", \"strip_trademark\": true }"} — value_map: {"{ \"mappings\": { \"29er\": \"29\" } }"}
        </p>
      </div>
      <div>
        <label htmlFor="rule-priority" className="block text-sm font-medium text-stone-700 mb-1">
          Priority (higher = applied first)
        </label>
        <input
          id="rule-priority"
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

function KeyAliasForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  initial: { raw_substr: string; canonical_key: string; priority: number };
  onSubmit: (body: { raw_substr: string; canonical_key: string; priority: number }) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
}) {
  const [rawSubstr, setRawSubstr] = useState(initial.raw_substr);
  const [canonicalKey, setCanonicalKey] = useState(initial.canonical_key);
  const [priority, setPriority] = useState(initial.priority);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!rawSubstr.trim() || !canonicalKey.trim()) {
      setError("Raw substring and canonical key required");
      return;
    }
    setBusy(true);
    try {
      await onSubmit({ raw_substr: rawSubstr.trim(), canonical_key: canonicalKey.trim(), priority });
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
        <label htmlFor="alias-raw" className="block text-sm font-medium text-stone-700 mb-1">
          Raw substring (matched case-insensitive in PDP spec key)
        </label>
        <input
          id="alias-raw"
          type="text"
          value={rawSubstr}
          onChange={(e) => setRawSubstr(e.target.value)}
          placeholder="hub spacing"
          className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
        />
      </div>
      <div>
        <label htmlFor="alias-canonical" className="block text-sm font-medium text-stone-700 mb-1">
          Canonical key
        </label>
        <input
          id="alias-canonical"
          type="text"
          value={canonicalKey}
          onChange={(e) => setCanonicalKey(e.target.value)}
          placeholder="hub_spacing"
          className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
        />
      </div>
      <div>
        <label htmlFor="alias-priority" className="block text-sm font-medium text-stone-700 mb-1">
          Priority (higher = matched first)
        </label>
        <input
          id="alias-priority"
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

export function NormalizationManager() {
  const [rulesAdding, setRulesAdding] = useState(false);
  const [rulesEditingId, setRulesEditingId] = useState<number | null>(null);
  const [aliasesAdding, setAliasesAdding] = useState(false);
  const [aliasesEditingId, setAliasesEditingId] = useState<number | null>(null);

  const { data: unmapped, isPending: unmappedLoading } = useUnmappedItems(20);
  const { data: rules = [], isPending: rulesLoading } = useSpecNormalizationRules();
  const { data: keyAliases = [], isPending: aliasesLoading } = useSpecKeyAliases();

  const createRule = useCreateSpecNormalizationRule();
  const updateRule = useUpdateSpecNormalizationRule();
  const deleteRule = useDeleteSpecNormalizationRule();
  const createAlias = useCreateSpecKeyAlias();
  const updateAlias = useUpdateSpecKeyAlias();
  const deleteAlias = useDeleteSpecKeyAlias();
  const renormalize = useTriggerRenormalizeSpecs();
  const { data: llmProfiles = [], isPending: llmProfilesLoading } = useLLMProfiles();
  const runLLM = useRunLLMExtractionForCategory();

  const sortedRules = [...rules].sort((a, b) => b.priority - a.priority);
  const sortedAliases = [...keyAliases].sort((a, b) => b.priority - a.priority);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-stone-900">Normalization Manager</h1>
        <p className="text-sm text-stone-600 mt-1">
          Configure spec key aliases, value normalization rules, and re-apply to all listings.
        </p>
      </div>

      {/* Unmapped items dashboard */}
      <section className="rounded-lg border border-stone-200 bg-white p-4">
        <h2 className="text-lg font-medium text-stone-800 mb-3">Unmapped items</h2>
        {unmappedLoading ? (
          <p className="text-sm text-stone-500">Loading…</p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-stone-600">
              <strong>{unmapped?.uncategorized_count ?? 0}</strong> in-stock listings have no
              canonical category. Add taxonomy mappings in{" "}
              <Link to="/admin/taxonomy" className="text-stone-700 underline">
                Taxonomy
              </Link>
              , then run Re-categorize.
            </p>
            {unmapped?.unmapped_category_paths && unmapped.unmapped_category_paths.length > 0 && (
              <div>
                <p className="text-sm font-medium text-stone-700 mb-2">Top raw category paths:</p>
                <ul className="text-sm space-y-1">
                  {unmapped.unmapped_category_paths.map((u, i) => (
                    <li key={i} className="flex gap-2">
                      <code className="bg-stone-100 px-1 rounded">{u.category_path}</code>
                      <span className="text-stone-500">({u.count} listings)</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Re-normalize */}
      <section className="rounded-lg border border-stone-200 bg-white p-4">
        <h2 className="text-lg font-medium text-stone-800 mb-3">Re-normalize all listings</h2>
        <p className="text-sm text-stone-600 mb-3">
          Re-apply spec key aliases and value rules to every listing&apos;s metadata.specs. Use
          after adding or editing rules.
        </p>
        <button
          type="button"
          onClick={() => renormalize.mutate(undefined)}
          disabled={renormalize.isPending}
          className="rounded bg-stone-700 px-3 py-2 text-sm text-white hover:bg-stone-600 disabled:opacity-50"
        >
          {renormalize.isPending ? "Re-normalizing…" : "Re-normalize specs"}
        </button>
        {renormalize.data?.updated != null && (
          <span className="ml-2 text-sm text-stone-600">{renormalize.data.updated} listings updated</span>
        )}
        {renormalize.error && (
          <p className="text-sm text-red-600 mt-2">{renormalize.error.message}</p>
        )}
      </section>

      {/* LLM Extraction */}
      <section className="rounded-lg border border-stone-200 bg-white p-4">
        <h2 className="text-lg font-medium text-stone-800 mb-3">LLM Extraction</h2>
        <p className="text-sm text-stone-600 mb-3">
          Re-run LLM spec extraction for all listings in a canonical category. Configure prompt
          profiles in{" "}
          <Link to="/admin/llm-profiles" className="text-stone-700 underline">
            LLM Profiles
          </Link>
          .
        </p>
        {llmProfilesLoading ? (
          <p className="text-sm text-stone-500">Loading profiles…</p>
        ) : llmProfiles.length === 0 ? (
          <p className="text-sm text-stone-500">
            No LLM profiles yet.{" "}
            <Link to="/admin/llm-profiles" className="text-stone-700 underline">
              Create one
            </Link>
            .
          </p>
        ) : (
          <div className="space-y-2">
            {llmProfiles
              .filter((p) => p.enabled)
              .map((profile) => (
                <div
                  key={profile.id}
                  className="flex items-center justify-between rounded border border-stone-200 bg-stone-50 px-3 py-2"
                >
                  <span className="text-sm font-medium text-stone-800">{profile.name}</span>
                  <span className="text-xs text-stone-500 mr-2">
                    {profile.canonical_category.join(" > ")}
                  </span>
                  <button
                    type="button"
                    onClick={() => runLLM.mutate(profile.canonical_category)}
                    disabled={runLLM.isPending}
                    className="rounded border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-100 disabled:opacity-50"
                  >
                    {runLLM.isPending ? "Running…" : "Re-run"}
                  </button>
                </div>
              ))}
            {llmProfiles.filter((p) => p.enabled).length === 0 && (
              <p className="text-sm text-stone-500">No enabled profiles.</p>
            )}
            {runLLM.data?.processed != null && (
              <p className="text-sm text-stone-600">{runLLM.data.processed} listings processed</p>
            )}
            {runLLM.error && (
              <p className="text-sm text-red-600">{runLLM.error.message}</p>
            )}
          </div>
        )}
      </section>

      {/* Value rules */}
      <section className="rounded-lg border border-stone-200 bg-white p-4">
        <h2 className="text-lg font-medium text-stone-800 mb-3">Spec value normalization rules</h2>
        <p className="text-sm text-stone-600 mb-3">
          Apply transforms to spec values at write time (during enrichment). Rules run in priority
          order.
        </p>
        {rulesEditingId != null && (
          <div className="mb-4 p-4 bg-stone-50 rounded border border-stone-200">
            <h3 className="text-sm font-medium mb-2">Edit rule</h3>
            <RuleForm
              initial={
                (() => {
                  const r = rules.find((x) => x.id === rulesEditingId) as SpecNormalizationRule | undefined;
                  return {
                    spec_key: r?.spec_key ?? "",
                    rule_type: r?.rule_type ?? "value_map",
                    config: r?.config ?? {},
                    priority: r?.priority ?? 0,
                  };
                })()
              }
              onSubmit={async (body) => {
                await updateRule.mutateAsync({ id: rulesEditingId!, body });
                setRulesEditingId(null);
              }}
              onCancel={() => setRulesEditingId(null)}
              submitLabel="Update"
            />
          </div>
        )}
        {rulesAdding && (
          <div className="mb-4 p-4 bg-stone-50 rounded border border-stone-200">
            <h3 className="text-sm font-medium mb-2">Add rule</h3>
            <RuleForm
              initial={{ spec_key: "", rule_type: "value_map", config: {}, priority: 0 }}
              onSubmit={async (body) => {
                await createRule.mutateAsync(body);
                setRulesAdding(false);
              }}
              onCancel={() => setRulesAdding(false)}
              submitLabel="Add"
            />
          </div>
        )}
        {!rulesAdding && !rulesEditingId && (
          <button
            type="button"
            onClick={() => setRulesAdding(true)}
            className="mb-4 rounded border border-stone-300 px-3 py-2 text-sm hover:bg-stone-50"
          >
            + Add rule
          </button>
        )}
        {rulesLoading ? (
          <p className="text-sm text-stone-500">Loading…</p>
        ) : sortedRules.length === 0 ? (
          <p className="text-sm text-stone-500">No rules yet. Add one to normalize spec values.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left">
                <th className="py-2 pr-2">Spec key</th>
                <th className="py-2 pr-2">Type</th>
                <th className="py-2 pr-2">Config</th>
                <th className="py-2 pr-2">Priority</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedRules.map((r) => (
                <tr key={r.id} className="border-b border-stone-100">
                  <td className="py-2 pr-2 font-mono">{r.spec_key}</td>
                  <td className="py-2 pr-2">{r.rule_type}</td>
                  <td className="py-2 pr-2 font-mono text-xs max-w-xs truncate">
                    {JSON.stringify(r.config)}
                  </td>
                  <td className="py-2 pr-2">{r.priority}</td>
                  <td className="py-2">
                    <button
                      type="button"
                      onClick={() => setRulesEditingId(r.id)}
                      className="text-stone-600 hover:text-stone-900 mr-2"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => (confirm("Delete this rule?") ? deleteRule.mutate(r.id) : null)}
                      className="text-red-600 hover:text-red-800"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Key aliases */}
      <section className="rounded-lg border border-stone-200 bg-white p-4">
        <h2 className="text-lg font-medium text-stone-800 mb-3">Spec key aliases</h2>
        <p className="text-sm text-stone-600 mb-3">
          Map raw PDP spec key strings (e.g. &quot;Hub Spacing&quot;) to canonical keys
          (e.g. hub_spacing). First substring match wins.
        </p>
        {aliasesEditingId != null && (
          <div className="mb-4 p-4 bg-stone-50 rounded border border-stone-200">
            <h3 className="text-sm font-medium mb-2">Edit alias</h3>
            <KeyAliasForm
              initial={
                (() => {
                  const a = keyAliases.find((x) => x.id === aliasesEditingId) as SpecKeyAlias | undefined;
                  return {
                    raw_substr: a?.raw_substr ?? "",
                    canonical_key: a?.canonical_key ?? "",
                    priority: a?.priority ?? 0,
                  };
                })()
              }
              onSubmit={async (body) => {
                await updateAlias.mutateAsync({ id: aliasesEditingId!, body });
                setAliasesEditingId(null);
              }}
              onCancel={() => setAliasesEditingId(null)}
              submitLabel="Update"
            />
          </div>
        )}
        {aliasesAdding && (
          <div className="mb-4 p-4 bg-stone-50 rounded border border-stone-200">
            <h3 className="text-sm font-medium mb-2">Add alias</h3>
            <KeyAliasForm
              initial={{ raw_substr: "", canonical_key: "", priority: 0 }}
              onSubmit={async (body) => {
                await createAlias.mutateAsync(body);
                setAliasesAdding(false);
              }}
              onCancel={() => setAliasesAdding(false)}
              submitLabel="Add"
            />
          </div>
        )}
        {!aliasesAdding && !aliasesEditingId && (
          <button
            type="button"
            onClick={() => setAliasesAdding(true)}
            className="mb-4 rounded border border-stone-300 px-3 py-2 text-sm hover:bg-stone-50"
          >
            + Add alias
          </button>
        )}
        {aliasesLoading ? (
          <p className="text-sm text-stone-500">Loading…</p>
        ) : sortedAliases.length === 0 ? (
          <p className="text-sm text-stone-500">No aliases (using built-in defaults).</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left">
                <th className="py-2 pr-2">Raw substring</th>
                <th className="py-2 pr-2">Canonical key</th>
                <th className="py-2 pr-2">Priority</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedAliases.map((a) => (
                <tr key={a.id} className="border-b border-stone-100">
                  <td className="py-2 pr-2 font-mono">{a.raw_substr}</td>
                  <td className="py-2 pr-2 font-mono">{a.canonical_key}</td>
                  <td className="py-2 pr-2">{a.priority}</td>
                  <td className="py-2">
                    <button
                      type="button"
                      onClick={() => setAliasesEditingId(a.id)}
                      className="text-stone-600 hover:text-stone-900 mr-2"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => (confirm("Delete this alias?") ? deleteAlias.mutate(a.id) : null)}
                      className="text-red-600 hover:text-red-800"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
