"use client";

import { useState, useEffect } from "react";
import { useCategoryClassifier, useCanonicalCategoryPaths } from "./hooks/queries";
import {
  useUpdateCategoryClassifier,
  useTestCategoryClassifier,
  useRunCategoryClassifier,
} from "./hooks/mutations";
import { runCategoryClassifier } from "./api";

export function CategoryClassifierManager() {
  const { data: config, isLoading } = useCategoryClassifier();
  const { data: canonicalPaths = [] } = useCanonicalCategoryPaths();
  const updateMutation = useUpdateCategoryClassifier();
  const testMutation = useTestCategoryClassifier();
  const runMutation = useRunCategoryClassifier();

  const [systemPrompt, setSystemPrompt] = useState(config?.system_prompt ?? "");
  const [confidenceThreshold, setConfidenceThreshold] = useState(
    config?.confidence_threshold ?? 0.8
  );
  const [enabled, setEnabled] = useState(config?.enabled ?? true);
  const [testListingId, setTestListingId] = useState("");
  const [testResult, setTestResult] = useState<{
    canonical_category: string[];
    confidence: number;
    reasoning: string;
  } | null>(null);
  const [runStore, setRunStore] = useState("");
  const [runLimit, setRunLimit] = useState(100);
  const [runCanonical, setRunCanonical] = useState(""); // "Parent > Child" or ""
  const [runLlmBelow, setRunLlmBelow] = useState("");
  const [runEnrichment, setRunEnrichment] = useState<"any" | "yes" | "no">("any");
  const [preview, setPreview] = useState<{
    total: number;
    max_per_run: number;
    exceeds_max: boolean;
    sample: { id: number; product_name: string }[];
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Sync form when config loads
  useEffect(() => {
    if (config) {
      setSystemPrompt(config.system_prompt);
      setConfidenceThreshold(config.confidence_threshold);
      setEnabled(config.enabled);
    }
  }, [config]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    await updateMutation.mutateAsync({
      system_prompt: systemPrompt,
      confidence_threshold: confidenceThreshold,
      enabled,
    });
  }

  async function handleTest(e: React.FormEvent) {
    e.preventDefault();
    setTestResult(null);
    const id = parseInt(testListingId, 10);
    if (Number.isNaN(id) || id <= 0) return;
    const res = await testMutation.mutateAsync(id);
    setTestResult(res.result ?? null);
  }

  function buildRunParams() {
    const path =
      runCanonical.trim() === ""
        ? undefined
        : runCanonical.split(" > ").map((s) => s.trim()).filter(Boolean);
    let llmBelow: number | undefined;
    if (runLlmBelow.trim() !== "") {
      const n = parseFloat(runLlmBelow);
      if (!Number.isNaN(n) && n >= 0 && n <= 1) llmBelow = n;
    }
    let hasEnrichment: boolean | undefined;
    if (runEnrichment === "yes") hasEnrichment = true;
    else if (runEnrichment === "no") hasEnrichment = false;
    return {
      store: runStore.trim() || undefined,
      canonical_category: path,
      limit: runLimit,
      llm_confidence_below: llmBelow,
      has_enrichment: hasEnrichment,
    };
  }

  async function handlePreview(e: React.FormEvent) {
    e.preventDefault();
    setPreview(null);
    setPreviewLoading(true);
    try {
      const res = await runCategoryClassifier({ ...buildRunParams(), dry_run: true });
      if ("total" in res) {
        setPreview({
          total: res.total,
          max_per_run: res.max_per_run,
          exceeds_max: res.exceeds_max,
          sample: res.sample,
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleRun(e: React.FormEvent) {
    e.preventDefault();
    setPreview(null);
    await runMutation.mutateAsync({ ...buildRunParams(), dry_run: false });
  }

  if (isLoading) {
    return <p className="text-stone-600">Loading…</p>;
  }

  if (!config) {
    return (
      <div>
        <h2 className="text-lg font-semibold text-stone-800 mb-4">
          Category Classifier
        </h2>
        <p className="text-stone-600">
          No category classifier config found. Run the migration
          (015_llm_category_classifier) to seed the default config.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h2 className="text-lg font-semibold text-stone-800">
        LLM Category Classifier
      </h2>
      <p className="text-sm text-stone-600 max-w-2xl">
        Uses an LLM to refine product categories when taxonomy.Map() is ambiguous.
        Runs after enrichment; when confidence is above the threshold, canonical_category
        is updated. The classifier uses the current Category Tree automatically — categories
        you add or edit in the tree are immediately eligible for classification. Configure
        OPENAI_API_KEY to enable.
      </p>

      <form onSubmit={handleSave} className="space-y-4 max-w-2xl">
        <h3 className="font-medium text-stone-700">Config</h3>
        {(updateMutation.error || updateMutation.isSuccess) && (
          <p
            className={`text-sm ${updateMutation.isSuccess ? "text-green-600" : "text-red-600"}`}
          >
            {updateMutation.isSuccess ? "Saved." : updateMutation.error?.message}
          </p>
        )}
        <div>
          <label
            htmlFor="system-prompt"
            className="block text-sm font-medium text-stone-700 mb-1"
          >
            System prompt
          </label>
          <textarea
            id="system-prompt"
            rows={8}
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900 font-mono text-sm"
          />
        </div>
        <div className="flex gap-6">
          <div>
            <label
              htmlFor="confidence"
              className="block text-sm font-medium text-stone-700 mb-1"
            >
              Confidence threshold (0–1)
            </label>
            <input
              id="confidence"
              type="number"
              min={0.5}
              max={1}
              step={0.05}
              value={confidenceThreshold}
              onChange={(e) =>
                setConfidenceThreshold(parseFloat(e.target.value) || 0.8)
              }
              className="w-24 rounded border border-stone-300 px-3 py-2 text-stone-900"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="enabled"
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="rounded border-stone-300"
            />
            <label htmlFor="enabled" className="text-sm font-medium text-stone-700">
              Enabled
            </label>
          </div>
        </div>
        <button
          type="submit"
          disabled={updateMutation.isPending}
          className="rounded bg-stone-800 px-4 py-2 text-white text-sm hover:bg-stone-700 disabled:opacity-50"
        >
          {updateMutation.isPending ? "Saving…" : "Save"}
        </button>
      </form>

      <div className="border-t border-stone-200 pt-6 space-y-4">
        <h3 className="font-medium text-stone-700">Test</h3>
        <form onSubmit={handleTest} className="flex gap-2 items-end">
          <div>
            <label
              htmlFor="test-listing-id"
              className="block text-sm font-medium text-stone-600 mb-1"
            >
              Listing ID
            </label>
            <input
              id="test-listing-id"
              type="number"
              value={testListingId}
              onChange={(e) => setTestListingId(e.target.value)}
              placeholder="e.g. 123"
              className="w-32 rounded border border-stone-300 px-3 py-2 text-stone-900"
            />
          </div>
          <button
            type="submit"
            disabled={testMutation.isPending}
            className="rounded bg-stone-700 px-4 py-2 text-white text-sm hover:bg-stone-600 disabled:opacity-50"
          >
            {testMutation.isPending ? "Testing…" : "Test"}
          </button>
        </form>
        {testResult && (
          <div className="rounded border border-stone-200 bg-stone-50 p-4 text-sm">
            <p>
              <span className="font-medium">Category:</span>{" "}
              {testResult.canonical_category.join(" > ")}
            </p>
            <p>
              <span className="font-medium">Confidence:</span>{" "}
              {Math.round(testResult.confidence * 100)}%
            </p>
            <p>
              <span className="font-medium">Reasoning:</span> {testResult.reasoning}
            </p>
          </div>
        )}
      </div>

      <div className="border-t border-stone-200 pt-6 space-y-4">
        <h3 className="font-medium text-stone-700">Batch run</h3>
        <p className="text-sm text-stone-600 max-w-2xl">
          Re-classify listings (LLM only; no PDP re-scrape). Filter by store, exact canonical
          path, enrichment status, and stored confidence. Preview shows count and a sample. Uses
          stored description, specs, and category_path.
        </p>
        <form className="space-y-3 flex flex-col gap-3">
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label
                htmlFor="run-store"
                className="block text-sm font-medium text-stone-600 mb-1"
              >
                Store type (optional)
              </label>
              <input
                id="run-store"
                type="text"
                value={runStore}
                onChange={(e) => setRunStore(e.target.value)}
                placeholder="worldwidecyclery"
                className="w-40 rounded border border-stone-300 px-3 py-2 text-stone-900"
              />
            </div>
            <div>
              <label
                htmlFor="run-canonical"
                className="block text-sm font-medium text-stone-600 mb-1"
              >
                Canonical path (optional)
              </label>
              <select
                id="run-canonical"
                value={runCanonical}
                onChange={(e) => setRunCanonical(e.target.value)}
                className="w-64 max-w-full rounded border border-stone-300 px-3 py-2 text-sm text-stone-900"
              >
                <option value="">Any</option>
                {canonicalPaths.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="run-llm-below"
                className="block text-sm font-medium text-stone-600 mb-1"
              >
                LLM confidence &lt; (optional)
              </label>
              <input
                id="run-llm-below"
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={runLlmBelow}
                onChange={(e) => setRunLlmBelow(e.target.value)}
                placeholder="e.g. 0.7"
                className="w-24 rounded border border-stone-300 px-3 py-2 text-stone-900"
              />
            </div>
            <div>
              <label
                htmlFor="run-enrichment"
                className="block text-sm font-medium text-stone-600 mb-1"
              >
                PDP enriched
              </label>
              <select
                id="run-enrichment"
                value={runEnrichment}
                onChange={(e) => setRunEnrichment(e.target.value as "any" | "yes" | "no")}
                className="rounded border border-stone-300 px-3 py-2 text-sm"
              >
                <option value="any">Any</option>
                <option value="yes">Yes (has last_enriched)</option>
                <option value="no">Not yet</option>
              </select>
            </div>
            <div>
              <label
                htmlFor="run-limit"
                className="block text-sm font-medium text-stone-600 mb-1"
              >
                Max to process
              </label>
              <input
                id="run-limit"
                type="number"
                min={1}
                max={5000}
                value={runLimit}
                onChange={(e) => setRunLimit(parseInt(e.target.value, 10) || 100)}
                className="w-24 rounded border border-stone-300 px-3 py-2 text-stone-900"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handlePreview}
              disabled={previewLoading}
              className="rounded border border-stone-400 px-4 py-2 text-stone-800 text-sm hover:bg-stone-50 disabled:opacity-50"
            >
              {previewLoading ? "Preview…" : "Preview"}
            </button>
            <button
              type="button"
              onClick={handleRun}
              disabled={runMutation.isPending}
              className="rounded bg-stone-700 px-4 py-2 text-white text-sm hover:bg-stone-600 disabled:opacity-50"
            >
              {runMutation.isPending ? "Running…" : "Run re-classify"}
            </button>
          </div>
        </form>
        {preview && (
          <div className="rounded border border-stone-200 bg-stone-50 p-3 text-sm space-y-2 max-w-2xl">
            <p>
              <span className="font-medium">Matching listings:</span> {preview.total}
              {preview.exceeds_max && (
                <span className="text-amber-700">
                  {" "}
                  (exceeds per-run cap {preview.max_per_run} — narrow filters to run)
                </span>
              )}
            </p>
            {preview.sample.length > 0 && (
              <ul className="list-disc pl-5 text-stone-700">
                {preview.sample.map((s) => (
                  <li key={s.id}>
                    #{s.id} — {s.product_name || "(no name)"}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {runMutation.isSuccess && runMutation.data && "processed" in runMutation.data && (
          <p className="text-sm text-green-600">
            {runMutation.data.processed} listings processed
            {runMutation.data.job_id != null && runMutation.data.job_id > 0
              ? ` (job #${runMutation.data.job_id})`
              : ""}
            .
          </p>
        )}
        {runMutation.error && (
          <p className="text-sm text-red-600">{runMutation.error.message}</p>
        )}
      </div>
    </div>
  );
}
