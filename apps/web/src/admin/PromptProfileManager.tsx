import { useState } from "react";
import { useLLMProfiles } from "./hooks/queries";
import {
  useCreateLLMProfile,
  useUpdateLLMProfile,
  useDeleteLLMProfile,
  useTestLLMProfile,
} from "./hooks/mutations";
import { CategoryPicker } from "./CategoryPicker";

function ProfileForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  initial: {
    canonical_category: string[];
    name: string;
    system_prompt: string;
    extraction_schema: Record<string, unknown>;
    enabled: boolean;
  };
  onSubmit: (body: {
    canonical_category: string[];
    name: string;
    system_prompt: string;
    extraction_schema: Record<string, unknown>;
    enabled: boolean;
  }) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
}) {
  const [canonicalCategory, setCanonicalCategory] = useState<string[]>(initial.canonical_category);
  const [name, setName] = useState(initial.name);
  const [systemPrompt, setSystemPrompt] = useState(initial.system_prompt);
  const [schemaStr, setSchemaStr] = useState(
    JSON.stringify(initial.extraction_schema, null, 2)
  );
  const [enabled, setEnabled] = useState(initial.enabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (canonicalCategory.length === 0 || !name.trim() || !systemPrompt.trim()) {
      setError("Canonical category, name, and system prompt are required");
      return;
    }
    let extraction_schema: Record<string, unknown>;
    try {
      extraction_schema = JSON.parse(schemaStr);
    } catch {
      setError("Invalid JSON in extraction schema");
      return;
    }
    if (!extraction_schema.fields || !Array.isArray(extraction_schema.fields)) {
      setError("extraction_schema must have a 'fields' array");
      return;
    }
    setBusy(true);
    try {
      await onSubmit({
        canonical_category: canonicalCategory,
        name: name.trim(),
        system_prompt: systemPrompt.trim(),
        extraction_schema,
        enabled,
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
        <CategoryPicker
          id="profile-category"
          label="Canonical category"
          value={canonicalCategory}
          onChange={setCanonicalCategory}
        />
      </div>
      <div>
        <label htmlFor="profile-name" className="block text-sm font-medium text-stone-700 mb-1">
          Name
        </label>
        <input
          id="profile-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Mountain Bike Classification"
          className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
        />
      </div>
      <div>
        <label
          htmlFor="profile-prompt"
          className="block text-sm font-medium text-stone-700 mb-1"
        >
          System prompt
        </label>
        <textarea
          id="profile-prompt"
          rows={4}
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900 font-mono text-sm"
          placeholder="You are a mountain bike spec extraction expert..."
        />
      </div>
      <div>
        <label
          htmlFor="profile-schema"
          className="block text-sm font-medium text-stone-700 mb-1"
        >
          Extraction schema (JSON with &quot;fields&quot; array)
        </label>
        <p className="mb-2 text-xs text-stone-500">
          Each field: <code>key</code>, <code>type</code>, <code>description</code>, <code>values</code> (enum).
          Optional: <code>label</code> (filter UI), <code>sort_order</code> (higher = first),
          <code>filterable</code> (default true; use false e.g. for confidence).
        </p>
        <textarea
          id="profile-schema"
          rows={12}
          value={schemaStr}
          onChange={(e) => setSchemaStr(e.target.value)}
          className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900 font-mono text-sm"
          spellCheck={false}
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          id="profile-enabled"
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="rounded border-stone-300"
        />
        <label htmlFor="profile-enabled" className="text-sm text-stone-700">
          Enabled
        </label>
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

export function PromptProfileManager() {
  const { data: profiles, isLoading } = useLLMProfiles();
  const createMutation = useCreateLLMProfile();
  const updateMutation = useUpdateLLMProfile();
  const deleteMutation = useDeleteLLMProfile();
  const testMutation = useTestLLMProfile();

  const [editingId, setEditingId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [testModal, setTestModal] = useState<{ profileId: number; profileName: string } | null>(
    null
  );
  const [testListingId, setTestListingId] = useState("");
  const [testResult, setTestResult] = useState<Record<string, unknown> | null | "no-key">(null);

  const emptyForm = {
    canonical_category: [] as string[],
    name: "",
    system_prompt:
      "You are a mountain bike spec extraction expert. Given a product listing, extract structured specs.\n\nOnly include fields you can determine from the provided data. Use null for unknown fields.\nSet confidence 0-1 based on how certain you are about the overall extraction.",
    extraction_schema: {
      fields: [
        {
          key: "front_travel_mm",
          type: "integer",
          description: "Front fork travel in mm",
          label: "Front Travel (mm)",
          sort_order: 1,
        },
        {
          key: "rear_travel_mm",
          type: "integer",
          description: "Rear suspension travel in mm (null for hardtails)",
          label: "Rear Travel (mm)",
          sort_order: 2,
        },
        {
          key: "wheel_size",
          type: "enum",
          values: ["29", "27.5", "26", "mullet"],
          description: "Wheel size",
          label: "Wheel Size",
          sort_order: 3,
        },
        {
          key: "mtb_class",
          type: "enum",
          values: ["XC", "Downcountry", "Trail", "Enduro", "DH", "Dirt Jump", "Fat Bike"],
          description: "Mountain bike classification",
          label: "MTB Class",
          sort_order: 4,
        },
        {
          key: "frame_material",
          type: "enum",
          values: ["Carbon", "Aluminum", "Steel", "Titanium"],
          description: "Frame material",
          label: "Frame Material",
          sort_order: 5,
        },
        {
          key: "confidence",
          type: "number",
          description: "Overall confidence 0-1",
          filterable: false,
        },
      ],
    } as Record<string, unknown>,
    enabled: true,
  };

  async function handleCreate(body: Parameters<typeof createMutation.mutateAsync>[0]) {
    await createMutation.mutateAsync(body);
    setCreating(false);
  }

  async function handleUpdate(body: {
    canonical_category: string[];
    name: string;
    system_prompt: string;
    extraction_schema: Record<string, unknown>;
    enabled: boolean;
  }) {
    if (editingId == null) return;
    await updateMutation.mutateAsync({ id: editingId, body });
    setEditingId(null);
  }

  async function handleTest() {
    if (!testModal || !testListingId.trim()) return;
    const listingId = parseInt(testListingId, 10);
    if (!Number.isFinite(listingId) || listingId <= 0) {
      return;
    }
    try {
      const res = await testMutation.mutateAsync({
        profileId: testModal.profileId,
        listingId,
      });
      setTestResult(res.result === undefined ? "no-key" : res.result);
    } catch {
      setTestResult("no-key");
    }
  }

  const editingProfile = editingId
    ? profiles?.find((p) => p.id === editingId)
    : null;

  if (isLoading) {
    return <p className="text-stone-600">Loading profiles…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-stone-900">LLM Prompt Profiles</h2>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="rounded bg-stone-700 px-3 py-2 text-sm text-white hover:bg-stone-600"
        >
          Add profile
        </button>
      </div>

      <p className="text-sm text-stone-600">
        Profiles define extraction tasks per canonical category. When enrichment runs, the LLM uses
        the matching profile to extract structured specs (travel, wheel size, mtb_class, etc.) from
        product descriptions. Set <code className="rounded bg-stone-200 px-1">OPENAI_API_KEY</code> to
        enable.
      </p>

      {creating && (
        <div className="rounded border border-stone-200 bg-white p-4">
          <h3 className="mb-3 font-medium text-stone-800">New profile</h3>
          <ProfileForm
            initial={emptyForm}
            onSubmit={handleCreate}
            onCancel={() => setCreating(false)}
            submitLabel="Create"
          />
        </div>
      )}

      {editingProfile && (
        <div className="rounded border border-stone-200 bg-white p-4">
          <h3 className="mb-3 font-medium text-stone-800">Edit profile</h3>
          <ProfileForm
            initial={{
              canonical_category: editingProfile.canonical_category,
              name: editingProfile.name,
              system_prompt: editingProfile.system_prompt,
              extraction_schema:
                typeof editingProfile.extraction_schema === "object" &&
                editingProfile.extraction_schema !== null
                  ? (editingProfile.extraction_schema as Record<string, unknown>)
                  : { fields: [] },
              enabled: editingProfile.enabled,
            }}
            onSubmit={handleUpdate}
            onCancel={() => setEditingId(null)}
            submitLabel="Save"
          />
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full rounded border border-stone-200">
          <thead>
            <tr className="border-b border-stone-200 bg-stone-50">
              <th className="px-3 py-2 text-left text-sm font-medium text-stone-700">
                Category
              </th>
              <th className="px-3 py-2 text-left text-sm font-medium text-stone-700">Name</th>
              <th className="px-3 py-2 text-left text-sm font-medium text-stone-700">Enabled</th>
              <th className="px-3 py-2 text-right text-sm font-medium text-stone-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(profiles ?? []).map((p) => (
              <tr key={p.id} className="border-b border-stone-100">
                <td className="px-3 py-2 text-sm text-stone-900">
                  {Array.isArray(p.canonical_category)
                    ? (p.canonical_category as string[]).join(" > ")
                    : String(p.canonical_category)}
                </td>
                <td className="px-3 py-2 text-sm text-stone-900">{p.name}</td>
                <td className="px-3 py-2 text-sm">
                  {p.enabled ? (
                    <span className="text-green-700">Yes</span>
                  ) : (
                    <span className="text-stone-500">No</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setTestModal({ profileId: p.id, profileName: p.name })
                      }
                      className="rounded border border-stone-300 px-2 py-1 text-xs hover:bg-stone-50"
                    >
                      Test
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(p.id)}
                      className="rounded border border-stone-300 px-2 py-1 text-xs hover:bg-stone-50"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Delete profile "${p.name}"?`)) {
                          deleteMutation.mutate(p.id);
                        }
                      }}
                      className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {profiles?.length === 0 && !creating && (
        <p className="text-sm text-stone-500">No profiles yet. Add one to get started.</p>
      )}

      {testModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="test-modal-title"
        >
          <div className="w-full max-w-lg rounded bg-white p-6 shadow-lg">
            <h3 id="test-modal-title" className="mb-3 font-semibold text-stone-900">
              Test: {testModal.profileName}
            </h3>
            <p className="mb-2 text-sm text-stone-600">
              Enter a listing ID from the Data browser to preview LLM extraction.
            </p>
            <div className="mb-4 flex gap-2">
              <input
                type="number"
                value={testListingId}
                onChange={(e) => setTestListingId(e.target.value)}
                placeholder="Listing ID"
                className="flex-1 rounded border border-stone-300 px-3 py-2 text-stone-900"
              />
              <button
                type="button"
                onClick={handleTest}
                disabled={testMutation.isPending || !testListingId.trim()}
                className="rounded bg-stone-700 px-3 py-2 text-sm text-white hover:bg-stone-600 disabled:opacity-50"
              >
                {testMutation.isPending ? "Running…" : "Run"}
              </button>
            </div>
            {testResult !== null && (
              <div className="mb-4 rounded border border-stone-200 bg-stone-50 p-3">
                <p className="mb-2 text-xs font-medium text-stone-600">Result:</p>
                {testResult === "no-key" ? (
                  <p className="text-sm text-amber-700">
                    No result (API key not set, or error). Set OPENAI_API_KEY to enable.
                  </p>
                ) : (
                  <pre className="max-h-48 overflow-auto text-xs text-stone-800">
                    {JSON.stringify(testResult, null, 2)}
                  </pre>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                setTestModal(null);
                setTestListingId("");
                setTestResult(null);
              }}
              className="rounded border border-stone-300 px-3 py-2 text-sm hover:bg-stone-50"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
