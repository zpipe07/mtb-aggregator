"use client";

import { useId, useState } from "react";
import {
  useAdminStores,
  useAdminDashboard,
  useScrapeJobs,
  useEnrichJobs,
  useScrapeJob,
  useEnrichJob,
  useCanonicalCategoryPaths,
  useDBMigrations,
} from "./hooks/queries";
import {
  useTriggerScrape,
  useTriggerEnrich,
  useCancelScrapeJob,
  useCancelEnrichJob,
  useRunCategoryClassifier,
  useTriggerLLMSpecs,
  useRunDBMigrate,
  useRunDBSeed,
} from "./hooks/mutations";
import type { ScrapeJob, EnrichJob } from "./api";

const PAGE_SIZE = 20;

function formatDate(iso: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function durationMs(start: string, end: string | null | undefined): number | null {
  if (!end) return null;
  try {
    return new Date(end).getTime() - new Date(start).getTime();
  } catch {
    return null;
  }
}

function formatStatus(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusColor(status: string): string {
  switch (status) {
    case "completed":
      return "text-green-700";
    case "failed":
      return "text-red-700";
    case "stale":
      return "text-stone-600";
    case "timed_out":
    case "cancelled":
      return "text-amber-700";
    default:
      return "text-amber-700";
  }
}

export function Operations() {
  const enrichControlsId = useId();
  const ec = (s: string) => `${enrichControlsId}-${s}`;
  const [scrapeStoreType, setScrapeStoreType] = useState<string>("");
  const [enrichForce, setEnrichForce] = useState(false);
  const [enrichMode, setEnrichMode] = useState<
    "enrich" | "classify" | "llm_specs"
  >("enrich");
  const [enrichStore, setEnrichStore] = useState("");
  const [enrichCanonical, setEnrichCanonical] = useState("");
  const [enrichLlmBelow, setEnrichLlmBelow] = useState("");
  const [llmSpecsAllowEmpty, setLLmSpecsAllowEmpty] = useState(false);
  const [jobOffset, setJobOffset] = useState(0);
  const [enrichJobOffset, setEnrichJobOffset] = useState(0);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [selectedEnrichJobId, setSelectedEnrichJobId] = useState<number | null>(null);

  const { data: stores = [] } = useAdminStores();
  const { data: canonicalPaths = [] } = useCanonicalCategoryPaths();
  const { data: dashboardData } = useAdminDashboard();
  const scraperReachable = dashboardData?.scraper_reachable ?? false;

  const { data: jobs = [], isPending: jobsLoading, isError: jobsError, error: jobsErrorObj, refetch: refetchJobs } = useScrapeJobs({
    limit: PAGE_SIZE,
    offset: jobOffset,
  });
  const { data: enrichJobs = [], isPending: enrichJobsLoading } = useEnrichJobs({
    limit: PAGE_SIZE,
    offset: enrichJobOffset,
  });

  const { data: selectedScrapeJobDetail } = useScrapeJob(selectedJobId);
  const { data: selectedEnrichJobDetail } = useEnrichJob(selectedEnrichJobId);

  const scrapeMutation = useTriggerScrape();
  const enrichMutation = useTriggerEnrich();
  const classifyRunMutation = useRunCategoryClassifier();
  const llmSpecsMutation = useTriggerLLMSpecs();
  const cancelScrapeMutation = useCancelScrapeJob();
  const cancelEnrichMutation = useCancelEnrichJob();
  const dbMigrateMutation = useRunDBMigrate();
  const dbSeedMutation = useRunDBSeed();

  const {
    data: dbMigrationsData,
    isPending: dbMigrationsLoading,
    isError: dbMigrationsError,
    error: dbMigrationsErrorObj,
    refetch: refetchDBMigrations,
  } = useDBMigrations();

  const loading = useAdminStores().isPending && stores.length === 0;
  const error = jobsError ? (jobsErrorObj?.message ?? "Failed to load jobs") : null;

  function openJobDetail(job: ScrapeJob) {
    setSelectedJobId(job.id);
  }

  function openEnrichJobDetail(job: EnrichJob) {
    setSelectedEnrichJobId(job.id);
  }

  const selectedJob = selectedJobId != null
    ? (selectedScrapeJobDetail ?? jobs.find((j) => j.id === selectedJobId))
    : null;
  const selectedEnrichJob = selectedEnrichJobId != null
    ? (selectedEnrichJobDetail ?? enrichJobs.find((j) => j.id === selectedEnrichJobId))
    : null;

  if (loading) {
    return (
      <div>
        <h2 className="text-xl font-semibold text-stone-800 mb-4">Operations</h2>
        <p className="text-stone-600">Loading…</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-stone-800 mb-4">Operations</h2>

      {(scrapeMutation.isError ||
        enrichMutation.isError ||
        llmSpecsMutation.isError ||
        classifyRunMutation.isError ||
        cancelScrapeMutation.isError ||
        cancelEnrichMutation.isError ||
        dbMigrateMutation.isError ||
        dbSeedMutation.isError ||
        dbMigrationsError ||
        error) && (
        <div className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {scrapeMutation.error?.message ??
            enrichMutation.error?.message ??
            llmSpecsMutation.error?.message ??
            classifyRunMutation.error?.message ??
            cancelScrapeMutation.error?.message ??
            cancelEnrichMutation.error?.message ??
            dbMigrateMutation.error?.message ??
            dbSeedMutation.error?.message ??
            dbMigrationsErrorObj?.message ??
            error}
          <button
            type="button"
            onClick={() => {
              scrapeMutation.reset();
              enrichMutation.reset();
              llmSpecsMutation.reset();
              classifyRunMutation.reset();
              cancelScrapeMutation.reset();
              cancelEnrichMutation.reset();
              dbMigrateMutation.reset();
              dbSeedMutation.reset();
              if (jobsError) refetchJobs();
              if (dbMigrationsError) refetchDBMigrations();
            }}
            className="ml-2 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="mb-6 grid gap-6 sm:grid-cols-2">
        <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-medium text-stone-800 mb-3">Trigger scrape</h3>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={scrapeStoreType}
              onChange={(e) => setScrapeStoreType(e.target.value)}
              className="rounded border border-stone-300 px-3 py-2 text-sm text-stone-900"
            >
              <option value="">All stores</option>
              {stores.map((s) => (
                <option key={s.id} value={s.store_type}>
                  {s.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() =>
                scrapeMutation.mutate(scrapeStoreType || undefined, {
                  onSuccess: () => setJobOffset(0),
                })
              }
              disabled={scrapeMutation.isPending || !scraperReachable}
              className="rounded bg-stone-800 px-3 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
            >
              {scrapeMutation.isPending ? "Running…" : "Run"}
            </button>
            {!scraperReachable && (
              <span className="text-xs text-amber-600">Scraper unreachable</span>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-medium text-stone-800 mb-3">Trigger enrichment / re-classify / LLM specs</h3>
          <div className="flex flex-col gap-2 text-sm text-stone-700">
            <div className="flex flex-wrap gap-4">
              <label className="inline-flex items-center gap-1.5">
                <input
                  type="radio"
                  name="enrichMode"
                  checked={enrichMode === "enrich"}
                  onChange={() => setEnrichMode("enrich")}
                />
                Re-enrich (PDP + LLM)
              </label>
              <label className="inline-flex items-center gap-1.5">
                <input
                  type="radio"
                  name="enrichMode"
                  checked={enrichMode === "classify"}
                  onChange={() => setEnrichMode("classify")}
                />
                Re-classify only (LLM)
              </label>
              <label className="inline-flex items-center gap-1.5">
                <input
                  type="radio"
                  name="enrichMode"
                  checked={enrichMode === "llm_specs"}
                  onChange={() => setEnrichMode("llm_specs")}
                />
                LLM specs only (no PDP)
              </label>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label htmlFor={ec("enrich-store")} className="block text-xs text-stone-500 mb-0.5">
                  Store (optional)
                </label>
                <select
                  id={ec("enrich-store")}
                  value={enrichStore}
                  onChange={(e) => setEnrichStore(e.target.value)}
                  className="rounded border border-stone-300 px-2 py-1.5 text-stone-900 min-w-[10rem]"
                >
                  <option value="">All with enricher</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.store_type}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={ec("enrich-canonical")} className="block text-xs text-stone-500 mb-0.5">
                  Canonical path (optional)
                </label>
                <select
                  id={ec("enrich-canonical")}
                  value={enrichCanonical}
                  onChange={(e) => setEnrichCanonical(e.target.value)}
                  className="rounded border border-stone-300 px-2 py-1.5 text-stone-900 max-w-xs"
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
                <label htmlFor={ec("enrich-llm")} className="block text-xs text-stone-500 mb-0.5">
                  LLM conf. &lt;
                </label>
                <input
                  id={ec("enrich-llm")}
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={enrichLlmBelow}
                  onChange={(e) => setEnrichLlmBelow(e.target.value)}
                  placeholder="0.7"
                  className="w-20 rounded border border-stone-300 px-2 py-1.5"
                />
              </div>
            </div>
            {enrichMode === "llm_specs" && (
              <label className="inline-flex items-center gap-1.5 text-xs text-stone-600 max-w-xl">
                <input
                  type="checkbox"
                  checked={llmSpecsAllowEmpty}
                  onChange={(e) => setLLmSpecsAllowEmpty(e.target.checked)}
                  className="rounded border-stone-300"
                />
                Include listings without scraped specs (queries allow_empty_specs=1 semantics)
              </label>
            )}
            {enrichMode === "enrich" && (
              <label className="inline-flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={enrichForce}
                  onChange={(e) => setEnrichForce(e.target.checked)}
                  className="rounded border-stone-300"
                />
                Force (skip 7-day staleness filter)
              </label>
            )}
            <button
              type="button"
              onClick={() => {
                const pathArr =
                  enrichCanonical.trim() === ""
                    ? undefined
                    : enrichCanonical.split(" > ").map((s) => s.trim()).filter(Boolean);
                let below: number | undefined;
                if (enrichLlmBelow.trim() !== "") {
                  const n = parseFloat(enrichLlmBelow);
                  if (!Number.isNaN(n) && n >= 0 && n <= 1) below = n;
                }
                const onDone = () => setEnrichJobOffset(0);
                if (enrichMode === "enrich") {
                  enrichMutation.mutate(
                    {
                      force: enrichForce,
                      store: enrichStore || undefined,
                      canonical_category: enrichCanonical || undefined,
                      llm_confidence_below: below,
                    },
                    { onSuccess: onDone },
                  );
                } else if (enrichMode === "llm_specs") {
                  llmSpecsMutation.mutate(
                    {
                      store: enrichStore || undefined,
                      canonical_category: enrichCanonical || undefined,
                      llm_confidence_below: below,
                      allow_empty_specs: llmSpecsAllowEmpty || undefined,
                    },
                    { onSuccess: onDone },
                  );
                } else {
                  classifyRunMutation.mutate(
                    {
                      store: enrichStore || undefined,
                      canonical_category: pathArr,
                      llm_confidence_below: below,
                    },
                    { onSuccess: onDone },
                  );
                }
              }}
              disabled={
                enrichMutation.isPending ||
                classifyRunMutation.isPending ||
                llmSpecsMutation.isPending
              }
              className="self-start rounded bg-stone-800 px-3 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
            >
              {enrichMutation.isPending ||
              classifyRunMutation.isPending ||
              llmSpecsMutation.isPending
                ? "Running…"
                : "Run"}
            </button>
            {classifyRunMutation.isSuccess &&
              classifyRunMutation.data &&
              "async" in classifyRunMutation.data &&
              classifyRunMutation.data.async && (
                <p className="text-xs text-green-700 mt-2 max-w-md">
                  Re-classify job #{classifyRunMutation.data.job_id} started in the background. Status
                  appears in Enrichment job history below.
                </p>
              )}
            {llmSpecsMutation.isSuccess &&
              llmSpecsMutation.data?.async &&
              typeof llmSpecsMutation.data.job_id === "number" && (
                <p className="text-xs text-green-700 mt-2 max-w-md">
                  LLM specs job #{llmSpecsMutation.data.job_id} started in the background. Status appears
                  in Enrichment job history below.
                </p>
              )}
          </div>
        </div>
      </div>

      <div className="mb-6 rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-medium text-stone-800 mb-1">Database maintenance</h3>
        <p className="text-xs text-stone-500 mb-3">
          Run incremental SQL migrations and idempotent store seed data. Migrations are tracked in{" "}
          <code className="text-stone-600">schema_migrations</code>.
        </p>
        {dbMigrationsData && !dbMigrationsData.ops_allowed && (
          <p className="mb-3 text-xs text-amber-700 rounded border border-amber-200 bg-amber-50 px-2 py-1.5">
            DB run actions are disabled in production unless{" "}
            <code className="text-amber-800">ALLOW_ADMIN_DB_OPS=1</code> is set on the API.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <button
            type="button"
            onClick={() => dbMigrateMutation.mutate(undefined)}
            disabled={
              dbMigrateMutation.isPending ||
              dbSeedMutation.isPending ||
              dbMigrationsLoading ||
              dbMigrationsData?.ops_allowed === false ||
              (dbMigrationsData?.pending_count ?? 0) === 0
            }
            className="rounded bg-stone-800 px-3 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
          >
            {dbMigrateMutation.isPending
              ? "Running migrations…"
              : `Run pending migrations${dbMigrationsData ? ` (${dbMigrationsData.pending_count})` : ""}`}
          </button>
          <button
            type="button"
            onClick={() => dbSeedMutation.mutate(undefined)}
            disabled={
              dbMigrateMutation.isPending ||
              dbSeedMutation.isPending ||
              dbMigrationsLoading ||
              dbMigrationsData?.ops_allowed === false
            }
            className="rounded border border-stone-300 px-3 py-2 text-sm text-stone-800 hover:bg-stone-50 disabled:opacity-50"
          >
            {dbSeedMutation.isPending ? "Running seed…" : "Run seed"}
          </button>
          <button
            type="button"
            onClick={() => refetchDBMigrations()}
            disabled={dbMigrationsLoading}
            className="rounded border border-stone-300 px-3 py-2 text-sm text-stone-600 hover:bg-stone-50 disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
        {dbMigrateMutation.isSuccess && dbMigrateMutation.data && (
          <p className="text-xs text-green-700 mb-3">
            Applied {dbMigrateMutation.data.applied.length} migration
            {dbMigrateMutation.data.applied.length === 1 ? "" : "s"}
            {dbMigrateMutation.data.applied.length > 0
              ? `: ${dbMigrateMutation.data.applied.join(", ")}`
              : " (none pending)"}
          </p>
        )}
        {dbSeedMutation.isSuccess && (
          <p className="text-xs text-green-700 mb-3">Seed completed successfully.</p>
        )}
        {dbMigrationsLoading ? (
          <p className="text-sm text-stone-500">Loading migration status…</p>
        ) : dbMigrationsData ? (
          <div className="overflow-x-auto max-h-48 overflow-y-auto rounded border border-stone-100">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50 sticky top-0">
                  <th className="px-3 py-1.5 text-left font-medium text-stone-600">Migration</th>
                  <th className="px-3 py-1.5 text-left font-medium text-stone-600">Status</th>
                  <th className="px-3 py-1.5 text-left font-medium text-stone-600">Applied at</th>
                </tr>
              </thead>
              <tbody>
                {dbMigrationsData.migrations.map((m) => (
                  <tr key={m.filename} className="border-b border-stone-100">
                    <td className="px-3 py-1.5 font-mono text-stone-800">{m.filename}</td>
                    <td className={`px-3 py-1.5 ${m.applied ? "text-green-700" : "text-amber-700"}`}>
                      {m.applied ? "Applied" : "Pending"}
                    </td>
                    <td className="px-3 py-1.5 text-stone-600">
                      {m.applied_at ? formatDate(m.applied_at) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <div className="rounded-lg border border-stone-200 bg-white shadow-sm overflow-hidden">
        <h3 className="border-b border-stone-200 px-4 py-3 text-sm font-medium text-stone-800">
          Scrape job history
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50">
                <th className="px-4 py-2 text-left font-medium text-stone-600">Store</th>
                <th className="px-4 py-2 text-left font-medium text-stone-600">Status</th>
                <th className="px-4 py-2 text-left font-medium text-stone-600">Started</th>
                <th className="px-4 py-2 text-left font-medium text-stone-600">Duration</th>
                <th className="px-4 py-2 text-right font-medium text-stone-600">Found</th>
                <th className="px-4 py-2 text-right font-medium text-stone-600">Upserted</th>
                <th className="px-4 py-2 text-right font-medium text-stone-600">Errors</th>
              </tr>
            </thead>
            <tbody>
              {(jobsLoading ? [] : jobs).map((job) => {
                const ms = durationMs(job.started_at, job.completed_at);
                const durationStr = ms != null ? `${(ms / 1000).toFixed(1)}s` : "—";
                const errCount = job.errors?.length ?? 0;
                return (
                  <tr
                    key={job.id}
                    className="border-b border-stone-100 hover:bg-stone-50 cursor-pointer"
                    onClick={() => openJobDetail(job)}
                  >
                    <td className="px-4 py-2 font-medium text-stone-800">{job.store_name}</td>
                    <td className={`px-4 py-2 ${statusColor(job.status)}`}>{formatStatus(job.status)}</td>
                    <td className="px-4 py-2 text-stone-600">{formatDate(job.started_at)}</td>
                    <td className="px-4 py-2 text-stone-600">{durationStr}</td>
                    <td className="px-4 py-2 text-right">{job.listings_found ?? "—"}</td>
                    <td className="px-4 py-2 text-right">{job.listings_upserted ?? "—"}</td>
                    <td className="px-4 py-2 text-right">
                      {errCount > 0 ? (
                        <span className="text-red-600">{errCount}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!jobsLoading && jobs.length === 0 && (
          <p className="px-4 py-6 text-center text-stone-500">No scrape jobs yet.</p>
        )}
        <div className="border-t border-stone-200 px-4 py-2 flex justify-between">
          <button
            type="button"
            onClick={() => setJobOffset((o) => Math.max(0, o - PAGE_SIZE))}
            disabled={jobOffset === 0}
            className="text-sm text-stone-600 hover:text-stone-800 disabled:opacity-50"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => setJobOffset((o) => o + PAGE_SIZE)}
            disabled={jobs.length < PAGE_SIZE}
            className="text-sm text-stone-600 hover:text-stone-800 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-stone-200 bg-white shadow-sm overflow-hidden">
        <h3 className="border-b border-stone-200 px-4 py-3 text-sm font-medium text-stone-800">
          Enrichment job history
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50">
                <th className="px-4 py-2 text-left font-medium text-stone-600">Store</th>
                <th className="px-4 py-2 text-left font-medium text-stone-600">Status</th>
                <th className="px-4 py-2 text-left font-medium text-stone-600">Started</th>
                <th className="px-4 py-2 text-left font-medium text-stone-600">Duration</th>
                <th className="px-4 py-2 text-right font-medium text-stone-600">Processed</th>
                <th className="px-4 py-2 text-right font-medium text-stone-600">Enriched</th>
                <th className="px-4 py-2 text-right font-medium text-stone-600">Errors</th>
                <th className="px-4 py-2 text-left font-medium text-stone-600">Type / mode</th>
              </tr>
            </thead>
            <tbody>
              {(enrichJobsLoading ? [] : enrichJobs).map((job) => {
                const ms = durationMs(job.started_at, job.completed_at);
                const durationStr = ms != null ? `${(ms / 1000).toFixed(1)}s` : "—";
                const errCount = job.errors?.length ?? 0;
                const storeLabel = job.store_type ?? "All";
                const jt = (job.job_type && job.job_type !== "") ? job.job_type : "enrich";
                return (
                  <tr
                    key={job.id}
                    className="border-b border-stone-100 hover:bg-stone-50 cursor-pointer"
                    onClick={() => openEnrichJobDetail(job)}
                  >
                    <td className="px-4 py-2 font-medium text-stone-800">{storeLabel}</td>
                    <td className={`px-4 py-2 ${statusColor(job.status)}`}>{formatStatus(job.status)}</td>
                    <td className="px-4 py-2 text-stone-600">{formatDate(job.started_at)}</td>
                    <td className="px-4 py-2 text-stone-600">{durationStr}</td>
                    <td className="px-4 py-2 text-right">{job.listings_processed ?? "—"}</td>
                    <td className="px-4 py-2 text-right">{job.listings_enriched ?? "—"}</td>
                    <td className="px-4 py-2 text-right">
                      {errCount > 0 ? (
                        <span className="text-red-600">{errCount}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-2 text-stone-600">
                      {jt}
                      {jt === "enrich" && (job.force_mode ? " · force" : " · normal")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!enrichJobsLoading && enrichJobs.length === 0 && (
          <p className="px-4 py-6 text-center text-stone-500">No enrichment jobs yet.</p>
        )}
        <div className="border-t border-stone-200 px-4 py-2 flex justify-between">
          <button
            type="button"
            onClick={() => setEnrichJobOffset((o) => Math.max(0, o - PAGE_SIZE))}
            disabled={enrichJobOffset === 0}
            className="text-sm text-stone-600 hover:text-stone-800 disabled:opacity-50"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => setEnrichJobOffset((o) => o + PAGE_SIZE)}
            disabled={enrichJobs.length < PAGE_SIZE}
            className="text-sm text-stone-600 hover:text-stone-800 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>

      {selectedJob && (
        <div
          className="fixed inset-0 z-10 flex items-center justify-center bg-stone-900/50 p-4"
          onClick={() => setSelectedJobId(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Job detail"
        >
          <div
            className="w-full max-w-lg max-h-[80vh] overflow-auto rounded-lg border border-stone-200 bg-white p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-stone-800 mb-2">
              Job #{selectedJob.id} — {selectedJob.store_name}
            </h3>
            <p className="text-sm text-stone-600 mb-4">
              {formatDate(selectedJob.started_at)}
              {selectedJob.completed_at && ` → ${formatDate(selectedJob.completed_at)}`}
              {" · "}
              <span className={statusColor(selectedJob.status)}>{formatStatus(selectedJob.status)}</span>
              {selectedJob.listings_found != null && ` · ${selectedJob.listings_found} found, ${selectedJob.listings_upserted ?? 0} upserted`}
            </p>
            {selectedJob.errors && selectedJob.errors.length > 0 && (
              <div className="mb-4">
                <h4 className="text-sm font-medium text-red-700 mb-1">Errors</h4>
                <ul className="list-disc list-inside text-sm text-stone-700 space-y-0.5 max-h-40 overflow-auto">
                  {selectedJob.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
            {selectedJob.warnings && selectedJob.warnings.length > 0 && (
              <div className="mb-4">
                <h4 className="text-sm font-medium text-amber-700 mb-1">Warnings</h4>
                <ul className="list-disc list-inside text-sm text-stone-700 space-y-0.5 max-h-40 overflow-auto">
                  {selectedJob.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex gap-2">
              {selectedJob.status === "running" && (
                <button
                  type="button"
                  onClick={() =>
                    cancelScrapeMutation.mutate(selectedJob.id, {
                      onSuccess: () => setSelectedJobId(null),
                    })
                  }
                  disabled={cancelScrapeMutation.isPending}
                  className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                >
                  {cancelScrapeMutation.isPending ? "Marking…" : "Mark Stale"}
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedJobId(null)}
                className="rounded border border-stone-300 px-3 py-2 text-sm text-stone-700 hover:bg-stone-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedEnrichJob && (
        <div
          className="fixed inset-0 z-10 flex items-center justify-center bg-stone-900/50 p-4"
          onClick={() => setSelectedEnrichJobId(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Enrich job detail"
        >
          <div
            className="w-full max-w-lg max-h-[80vh] overflow-auto rounded-lg border border-stone-200 bg-white p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-stone-800 mb-2">
              Enrich job #{selectedEnrichJob.id} — {selectedEnrichJob.store_type ?? "All stores"}
            </h3>
            <p className="text-sm text-stone-600 mb-4">
              {formatDate(selectedEnrichJob.started_at)}
              {selectedEnrichJob.completed_at && ` → ${formatDate(selectedEnrichJob.completed_at)}`}
              {" · "}
              <span className={statusColor(selectedEnrichJob.status)}>{formatStatus(selectedEnrichJob.status)}</span>
              {selectedEnrichJob.listings_processed != null && ` · ${selectedEnrichJob.listings_processed} processed, ${selectedEnrichJob.listings_enriched ?? 0} enriched`}
              {selectedEnrichJob.force_mode && " · Force mode"}
            </p>
            {selectedEnrichJob.errors && selectedEnrichJob.errors.length > 0 && (
              <div className="mb-4">
                <h4 className="text-sm font-medium text-red-700 mb-1">Errors</h4>
                <ul className="list-disc list-inside text-sm text-stone-700 space-y-0.5 max-h-40 overflow-auto">
                  {selectedEnrichJob.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex gap-2">
              {selectedEnrichJob.status === "running" && (
                <button
                  type="button"
                  onClick={() =>
                    cancelEnrichMutation.mutate(selectedEnrichJob.id, {
                      onSuccess: () => setSelectedEnrichJobId(null),
                    })
                  }
                  disabled={cancelEnrichMutation.isPending}
                  className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                >
                  {cancelEnrichMutation.isPending ? "Marking…" : "Mark Stale"}
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedEnrichJobId(null)}
                className="rounded border border-stone-300 px-3 py-2 text-sm text-stone-700 hover:bg-stone-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
