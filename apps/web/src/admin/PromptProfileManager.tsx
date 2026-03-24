"use client";

import { useEffect, useMemo, useState } from "react";
import { useLLMProfiles, useLLMProfile, useLLMExtractionFieldDefs } from "./hooks/queries";
import {
  useCreateLLMProfile,
  useUpdateLLMProfile,
  useDeleteLLMProfile,
  useTestLLMProfile,
} from "./hooks/mutations";
import { CategoryPicker } from "./CategoryPicker";
import { ExtractionFieldLibraryPanel } from "./ExtractionFieldLibraryPanel";
import { CompositionProfileForm } from "./CompositionProfileForm";
import { legacyFieldsToComposition, rowsFromApi } from "./compositionUtils";

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
          Use the <strong>Field library</strong> tab + composition editor when your profile uses migration
          019 rows. Raw JSON is for legacy profiles or new profiles before composition.
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

type Tab = "profiles" | "library";

function profileCategoryLabel(p: { canonical_category: unknown }): string {
  return Array.isArray(p.canonical_category)
    ? (p.canonical_category as string[]).join(" > ")
    : String(p.canonical_category);
}

export function PromptProfileManager() {
  const [tab, setTab] = useState<Tab>("profiles");
  const { data: profiles, isLoading } = useLLMProfiles();
  const createMutation = useCreateLLMProfile();
  const updateMutation = useUpdateLLMProfile();
  const deleteMutation = useDeleteLLMProfile();
  const testMutation = useTestLLMProfile();

  const { data: defsList, isLoading: defsLoading } = useLLMExtractionFieldDefs("");

  const [editingId, setEditingId] = useState<number | null>(null);
  const { data: editDetail, isLoading: editDetailLoading } = useLLMProfile(editingId);
  const [composeMode, setComposeMode] = useState(false);

  const [creating, setCreating] = useState(false);
  const [testModal, setTestModal] = useState<{ profileId: number; profileName: string } | null>(
    null
  );
  const [testListingId, setTestListingId] = useState("");
  const [testResult, setTestResult] = useState<Record<string, unknown> | null | "no-key">(null);

  useEffect(() => {
    setComposeMode(false);
  }, [editingId]);

  const profilesSortedByCategory = useMemo(() => {
    const list = [...(profiles ?? [])];
    list.sort((a, b) => {
      const byCat = profileCategoryLabel(a).localeCompare(profileCategoryLabel(b), undefined, {
        sensitivity: "base",
      });
      if (byCat !== 0) return byCat;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
    return list;
  }, [profiles]);

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

  async function handleUpdateLegacy(body: {
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

  const initialCompositionRows = useMemo(() => {
    if (!editDetail) return null;
    if (editDetail.profile_fields && editDetail.profile_fields.length > 0) {
      return rowsFromApi(editDetail.profile_fields);
    }
    if (composeMode) {
      if (!defsList) return null;
      return legacyFieldsToComposition(editDetail.extraction_schema, defsList);
    }
    return null;
  }, [editDetail, defsList, composeMode]);

  const useCompositionEditor =
    !!editDetail &&
    initialCompositionRows !== null &&
    ((editDetail.profile_fields?.length ?? 0) > 0 || composeMode);

  const waitingForDefsForComposition =
    !!editDetail &&
    composeMode &&
    (editDetail.profile_fields?.length ?? 0) === 0 &&
    defsLoading;

  async function handleClearComposition() {
    if (editingId == null || !editDetail) return;
    if (
      !confirm(
        "Remove all composition rows? You can then edit raw extraction_schema JSON again (legacy mode)."
      )
    ) {
      return;
    }
    await updateMutation.mutateAsync({
      id: editingId,
      body: {
        canonical_category: editDetail.canonical_category,
        name: editDetail.name,
        system_prompt: editDetail.system_prompt,
        enabled: editDetail.enabled,
        profile_fields: [],
      },
    });
    setComposeMode(false);
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

  if (isLoading) {
    return <p className="text-stone-600">Loading profiles…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b border-stone-200 pb-2">
        <button
          type="button"
          onClick={() => setTab("profiles")}
          className={`rounded px-3 py-1.5 text-sm ${
            tab === "profiles" ? "bg-stone-200 font-medium text-stone-900" : "text-stone-600 hover:bg-stone-100"
          }`}
        >
          Prompt profiles
        </button>
        <button
          type="button"
          onClick={() => setTab("library")}
          className={`rounded px-3 py-1.5 text-sm ${
            tab === "library" ? "bg-stone-200 font-medium text-stone-900" : "text-stone-600 hover:bg-stone-100"
          }`}
        >
          Field library
        </button>
      </div>

      {tab === "library" && <ExtractionFieldLibraryPanel />}

      {tab === "profiles" && (
        <>
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
            the matching profile to extract structured specs. After migration{" "}
            <code className="rounded bg-stone-200 px-1">019</code>, edit composed fields via the composition
            editor; manage shared templates on the <strong>Field library</strong> tab. Set{" "}
            <code className="rounded bg-stone-200 px-1">OPENAI_API_KEY</code> on the API to enable.
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

          {editingId != null && editDetailLoading && (
            <p className="text-sm text-stone-600">Loading profile…</p>
          )}

          {editingId != null && waitingForDefsForComposition && (
            <p className="text-sm text-stone-600">Loading field definitions…</p>
          )}

          {editingId != null &&
            editDetail &&
            useCompositionEditor &&
            initialCompositionRows && (
            <div className="rounded border border-stone-200 bg-white p-4">
              <h3 className="mb-3 font-medium text-stone-800">Edit profile (field library)</h3>
              <CompositionProfileForm
                key={`${editDetail.id}-${composeMode}-${editDetail.profile_fields?.length ?? 0}`}
                detail={editDetail}
                defs={defsList ?? []}
                initialRows={initialCompositionRows}
                onSave={async (body) => {
                  await updateMutation.mutateAsync({
                    id: editingId,
                    body: {
                      canonical_category: body.canonical_category,
                      name: body.name,
                      system_prompt: body.system_prompt,
                      enabled: body.enabled,
                      profile_fields: body.profile_fields,
                    },
                  });
                  setEditingId(null);
                  setComposeMode(false);
                }}
                onCancel={() => {
                  setEditingId(null);
                  setComposeMode(false);
                }}
              />
              <div className="mt-4 border-t border-stone-100 pt-3">
                <button
                  type="button"
                  onClick={handleClearComposition}
                  className="text-xs text-amber-800 underline"
                >
                  Clear composition (switch back to raw JSON editing)
                </button>
              </div>
            </div>
          )}

          {editingId != null &&
            editDetail &&
            !useCompositionEditor &&
            !editDetailLoading &&
            !waitingForDefsForComposition && (
              <div className="rounded border border-stone-200 bg-white p-4">
                <h3 className="mb-3 font-medium text-stone-800">Edit profile</h3>
                <p className="mb-3 text-xs text-stone-600">
                  This profile uses raw <code className="rounded bg-stone-200 px-0.5">extraction_schema</code>{" "}
                  JSON. Switch to the composition editor to use shared field definitions and overrides.
                </p>
                <button
                  type="button"
                  onClick={() => setComposeMode(true)}
                  className="mb-4 rounded border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50"
                >
                  Switch to field library composition
                </button>
                <ProfileForm
                  initial={{
                    canonical_category: editDetail.canonical_category,
                    name: editDetail.name,
                    system_prompt: editDetail.system_prompt,
                    extraction_schema:
                      typeof editDetail.extraction_schema === "object" &&
                      editDetail.extraction_schema !== null
                        ? (editDetail.extraction_schema as Record<string, unknown>)
                        : { fields: [] },
                    enabled: editDetail.enabled,
                  }}
                  onSubmit={handleUpdateLegacy}
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
                {profilesSortedByCategory.map((p) => (
                  <tr key={p.id} className="border-b border-stone-100">
                    <td className="px-3 py-2 text-sm text-stone-900">
                      {profileCategoryLabel(p)}
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
                          onClick={() => setTestModal({ profileId: p.id, profileName: p.name })}
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
        </>
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
