import { useState } from "react";
import { useCategoryClassifier } from "./hooks/queries";
import {
  useUpdateCategoryClassifier,
  useTestCategoryClassifier,
  useRunCategoryClassifier,
} from "./hooks/mutations";

export function CategoryClassifierManager() {
  const { data: config, isLoading } = useCategoryClassifier();
  const updateMutation = useUpdateCategoryClassifier();
  const testMutation = useTestCategoryClassifier();
  const runMutation = useRunCategoryClassifier();

  const [systemPrompt, setSystemPrompt] = useState(config?.system_prompt ?? "");
  const [confidenceThreshold, setConfidenceThreshold] = useState(
    config?.confidence_threshold ?? 0.8
  );
  const [enabled, setEnabled] = useState(config?.enabled ?? true);
  const [validCategoriesStr, setValidCategoriesStr] = useState("");
  const [testListingId, setTestListingId] = useState("");
  const [testResult, setTestResult] = useState<{
    canonical_category: string[];
    confidence: number;
    reasoning: string;
  } | null>(null);
  const [runStore, setRunStore] = useState("");
  const [runLimit, setRunLimit] = useState(100);

  // Sync form when config loads
  if (config && systemPrompt === "" && config.system_prompt !== "") {
    setSystemPrompt(config.system_prompt);
    setConfidenceThreshold(config.confidence_threshold);
    setEnabled(config.enabled);
    setValidCategoriesStr(
      config.valid_categories.map((p) => p.join(" > ")).join("\n")
    );
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const valid_categories = validCategoriesStr
      .split("\n")
      .map((line) =>
        line
          .split(">")
          .map((s) => s.trim())
          .filter(Boolean)
      )
      .filter((arr) => arr.length > 0);
    await updateMutation.mutateAsync({
      system_prompt: systemPrompt,
      confidence_threshold: confidenceThreshold,
      enabled,
      valid_categories: valid_categories.length > 0 ? valid_categories : undefined,
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

  async function handleRun(e: React.FormEvent) {
    e.preventDefault();
    await runMutation.mutateAsync({
      store: runStore.trim() || undefined,
      limit: runLimit,
    });
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
        is updated. Configure OPENAI_API_KEY to enable.
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
        <div>
          <label
            htmlFor="valid-categories"
            className="block text-sm font-medium text-stone-700 mb-1"
          >
            Valid categories (one per line, e.g. Bikes &gt; Mountain)
          </label>
          <textarea
            id="valid-categories"
            rows={12}
            value={validCategoriesStr}
            onChange={(e) => setValidCategoriesStr(e.target.value)}
            placeholder="Bikes > Mountain&#10;Bikes > Electric&#10;Components > Drivetrain"
            className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900 font-mono text-sm"
          />
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
        <p className="text-sm text-stone-600">
          Re-classify listings. Optionally filter by store. Uses stored description
          and specs.
        </p>
        <form onSubmit={handleRun} className="flex gap-4 items-end flex-wrap">
          <div>
            <label
              htmlFor="run-store"
              className="block text-sm font-medium text-stone-600 mb-1"
            >
              Store (optional)
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
              htmlFor="run-limit"
              className="block text-sm font-medium text-stone-600 mb-1"
            >
              Limit
            </label>
            <input
              id="run-limit"
              type="number"
              min={1}
              max={2000}
              value={runLimit}
              onChange={(e) => setRunLimit(parseInt(e.target.value, 10) || 100)}
              className="w-24 rounded border border-stone-300 px-3 py-2 text-stone-900"
            />
          </div>
          <button
            type="submit"
            disabled={runMutation.isPending}
            className="rounded bg-stone-700 px-4 py-2 text-white text-sm hover:bg-stone-600 disabled:opacity-50"
          >
            {runMutation.isPending ? "Running…" : "Run"}
          </button>
        </form>
        {runMutation.isSuccess && runMutation.data && (
          <p className="text-sm text-green-600">
            {runMutation.data.processed} listings processed.
          </p>
        )}
        {runMutation.error && (
          <p className="text-sm text-red-600">{runMutation.error.message}</p>
        )}
      </div>
    </div>
  );
}
