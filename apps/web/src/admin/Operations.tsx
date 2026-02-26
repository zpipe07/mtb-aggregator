import { useEffect, useState, useCallback } from "react";
import {
  fetchAdminStores,
  fetchScrapeJobs,
  fetchScrapeJob,
  triggerScrape,
  triggerEnrich,
  fetchDashboard,
  type AdminStore,
  type ScrapeJob,
} from "./api";

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

function statusColor(status: string): string {
  switch (status) {
    case "completed":
      return "text-green-700";
    case "failed":
      return "text-red-700";
    default:
      return "text-amber-700";
  }
}

export function Operations() {
  const [stores, setStores] = useState<AdminStore[]>([]);
  const [jobs, setJobs] = useState<ScrapeJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scrapeBusy, setScrapeBusy] = useState(false);
  const [enrichBusy, setEnrichBusy] = useState(false);
  const [scrapeStoreType, setScrapeStoreType] = useState<string>("");
  const [enrichForce, setEnrichForce] = useState(false);
  const [jobOffset, setJobOffset] = useState(0);
  const [selectedJob, setSelectedJob] = useState<ScrapeJob | null>(null);
  const [scraperReachable, setScraperReachable] = useState(false);

  const loadStores = useCallback(async () => {
    try {
      const s = await fetchAdminStores();
      setStores(s);
    } catch {
      setStores([]);
    }
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      loadStores(),
      fetchDashboard().then((d) => setScraperReachable(d.scraper_reachable)),
    ]).catch((e) => setError(e instanceof Error ? e.message : "Failed to load")).finally(() => setLoading(false));
  }, [loadStores]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (loading) return;
    fetchScrapeJobs({ limit: PAGE_SIZE, offset: jobOffset }).then(setJobs).catch((e) => setError(e instanceof Error ? e.message : "Failed to load jobs"));
  }, [loading, jobOffset]);

  async function runScrape() {
    setScrapeBusy(true);
    setError(null);
    try {
      await triggerScrape(scrapeStoreType || undefined);
      setJobOffset(0);
      await load();
      const j = await fetchScrapeJobs({ limit: PAGE_SIZE, offset: 0 });
      setJobs(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scrape failed");
    } finally {
      setScrapeBusy(false);
    }
  }

  async function runEnrich() {
    setEnrichBusy(true);
    setError(null);
    try {
      await triggerEnrich(enrichForce);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enrich failed");
    } finally {
      setEnrichBusy(false);
    }
  }

  async function openJobDetail(job: ScrapeJob) {
    if (job.errors?.length || job.warnings?.length) {
      const full = await fetchScrapeJob(job.id);
      setSelectedJob(full ?? job);
    } else {
      setSelectedJob(job);
    }
  }

  if (loading && stores.length === 0) {
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

      {error && (
        <div className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {error}
          <button type="button" onClick={() => setError(null)} className="ml-2 underline">
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
              onClick={runScrape}
              disabled={scrapeBusy || !scraperReachable}
              className="rounded bg-stone-800 px-3 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
            >
              {scrapeBusy ? "Running…" : "Run"}
            </button>
            {!scraperReachable && (
              <span className="text-xs text-amber-600">Scraper unreachable</span>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-medium text-stone-800 mb-3">Trigger enrichment</h3>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-sm text-stone-700">
              <input
                type="checkbox"
                checked={enrichForce}
                onChange={(e) => setEnrichForce(e.target.checked)}
                className="rounded border-stone-300"
              />
              Force re-enrich all
            </label>
            <button
              type="button"
              onClick={runEnrich}
              disabled={enrichBusy}
              className="rounded bg-stone-800 px-3 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
            >
              {enrichBusy ? "Running…" : "Run"}
            </button>
          </div>
        </div>
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
              {jobs.map((job) => {
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
                    <td className={`px-4 py-2 capitalize ${statusColor(job.status)}`}>{job.status}</td>
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
        {jobs.length === 0 && (
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

      {selectedJob && (
        <div
          className="fixed inset-0 z-10 flex items-center justify-center bg-stone-900/50 p-4"
          onClick={() => setSelectedJob(null)}
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
              <span className={statusColor(selectedJob.status)}>{selectedJob.status}</span>
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
            <button
              type="button"
              onClick={() => setSelectedJob(null)}
              className="rounded border border-stone-300 px-3 py-2 text-sm text-stone-700 hover:bg-stone-50"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
