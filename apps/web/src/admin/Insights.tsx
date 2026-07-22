"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { usePipelineMetrics, useStoreTypesWithEnrichers } from "./hooks/queries";

const DAY_OPTIONS = [14, 30, 90] as const;

function formatDateLabel(isoDate: string): string {
  try {
    return new Date(isoDate + "T12:00:00").toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return isoDate;
  }
}

function freshnessChartData(freshness: {
  never_enriched: number;
  lt_24h: number;
  d1_7: number;
  d7_30: number;
  gt_30d: number;
}) {
  return [
    { label: "Never enriched", count: freshness.never_enriched },
    { label: "< 24 hours", count: freshness.lt_24h },
    { label: "1–7 days", count: freshness.d1_7 },
    { label: "7–30 days", count: freshness.d7_30 },
    { label: "> 30 days", count: freshness.gt_30d },
  ];
}

function aggregateEnrichJobsByDay(
  jobs: {
    started_at: string;
    job_type?: string;
    listings_processed?: number | null;
    listings_enriched?: number | null;
  }[],
) {
  const map = new Map<string, { processed: number; enriched: number }>();
  for (const job of jobs) {
    if (job.job_type && job.job_type !== "enrich") continue;
    const day = job.started_at.slice(0, 10);
    const cur = map.get(day) ?? { processed: 0, enriched: 0 };
    cur.processed += job.listings_processed ?? 0;
    cur.enriched += job.listings_enriched ?? 0;
    map.set(day, cur);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({
      date,
      dateLabel: formatDateLabel(date),
      ...values,
    }));
}

function aggregateScrapeJobsByDay(
  jobs: {
    started_at: string;
    listings_upserted?: number | null;
  }[],
) {
  const map = new Map<string, number>();
  for (const job of jobs) {
    const day = job.started_at.slice(0, 10);
    map.set(day, (map.get(day) ?? 0) + (job.listings_upserted ?? 0));
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, upserted]) => ({
      date,
      dateLabel: formatDateLabel(date),
      upserted,
    }));
}

export function Insights() {
  const [days, setDays] = useState<number>(30);
  const { data, isPending, isError, error, refetch } = usePipelineMetrics(days);
  const { data: enricherTypes = [] } = useStoreTypesWithEnrichers();
  const enricherSet = useMemo(
    () => new Set(enricherTypes.map((t) => t.toLowerCase())),
    [enricherTypes],
  );

  const freshnessData = useMemo(
    () => (data ? freshnessChartData(data.freshness) : []),
    [data],
  );
  const enrichChartData = useMemo(
    () => (data ? aggregateEnrichJobsByDay(data.recent_enrich_jobs) : []),
    [data],
  );
  const scrapeChartData = useMemo(
    () => (data ? aggregateScrapeJobsByDay(data.recent_scrape_jobs) : []),
    [data],
  );

  if (isPending && !data) {
    return (
      <div>
        <h2 className="text-xl font-semibold text-stone-800 mb-4">Insights</h2>
        <p className="text-stone-600">Loading…</p>
      </div>
    );
  }

  if (isError && !data) {
    return (
      <div>
        <h2 className="text-xl font-semibold text-stone-800 mb-4">Insights</h2>
        <p className="text-red-600 mb-2">{error?.message ?? "Failed to load"}</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="rounded bg-stone-200 px-3 py-1.5 text-sm hover:bg-stone-300"
        >
          Retry
        </button>
      </div>
    );
  }

  const { backlog, freshness } = data!;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-stone-800">Insights</h2>
          <p className="text-sm text-stone-500 mt-1">
            Scrape and enrichment pipeline health — use backlog growth to tune enrich frequency.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-stone-500">Job history window</span>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="rounded border border-stone-300 bg-white px-2 py-1.5 text-sm"
          >
            {DAY_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d} days
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-stone-500">Enrichment backlog</p>
          <p className="text-2xl font-semibold text-stone-800">{backlog.total.toLocaleString()}</p>
          <p className="text-xs text-stone-400">In-stock listings needing enrich</p>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-stone-500">Stale since scrape</p>
          <p className="text-2xl font-semibold text-amber-700">
            {backlog.stale_since_scrape.toLocaleString()}
          </p>
          <p className="text-xs text-stone-400">Scraped after last enrich</p>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-stone-500">Never enriched</p>
          <p className="text-2xl font-semibold text-stone-800">
            {backlog.never_enriched.toLocaleString()}
          </p>
          <p className="text-xs text-stone-400">No PDP enrich yet</p>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-stone-500">In-stock listings</p>
          <p className="text-2xl font-semibold text-stone-800">
            {freshness.in_stock_total.toLocaleString()}
          </p>
          <p className="text-xs text-stone-400">Visible deals in catalog</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-medium text-stone-800 mb-1">Enrichment freshness</h3>
          <p className="text-xs text-stone-500 mb-4">
            Age of <code className="text-stone-600">last_enriched_at</code> for in-stock listings
          </p>
          {freshnessData.some((d) => d.count > 0) ? (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={freshnessData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip formatter={(v: number) => [v.toLocaleString(), "Listings"]} />
                  <Bar dataKey="count" fill="#57534e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-stone-500 py-8 text-center">No in-stock listings yet.</p>
          )}
        </section>

        <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-medium text-stone-800 mb-1">Enrich job throughput</h3>
          <p className="text-xs text-stone-500 mb-4">
            Daily totals from PDP enrich jobs (last {days} days)
          </p>
          {enrichChartData.length > 0 ? (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={enrichChartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="dateLabel" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="processed" name="Processed" stroke="#78716c" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="enriched" name="Enriched" stroke="#16a34a" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-stone-500 py-8 text-center">No enrich jobs in this window.</p>
          )}
        </section>
      </div>

      <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-medium text-stone-800 mb-1">Scrape volume</h3>
        <p className="text-xs text-stone-500 mb-4">
          Daily listings upserted across all stores (last {days} days)
        </p>
        {scrapeChartData.length > 0 ? (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={scrapeChartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="dateLabel" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip formatter={(v: number) => [v.toLocaleString(), "Upserted"]} />
                <Line type="monotone" dataKey="upserted" stroke="#57534e" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm text-stone-500 py-8 text-center">No scrape jobs in this window.</p>
        )}
      </section>

      <section className="rounded-lg border border-stone-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-stone-200">
          <h3 className="text-sm font-medium text-stone-800">Backlog by store</h3>
          <p className="text-xs text-stone-500 mt-0.5">
            In-stock listings where enrich is missing or older than last scrape
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50 text-left text-stone-600">
                <th className="px-4 py-2 font-medium">Store</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Enricher</th>
                <th className="px-4 py-2 font-medium text-right">Backlog</th>
              </tr>
            </thead>
            <tbody>
              {backlog.by_store.map((store) => {
                const hasEnricher = enricherSet.has(store.store_type.toLowerCase());
                return (
                  <tr key={store.store_id} className="border-b border-stone-100">
                    <td className="px-4 py-2 text-stone-800">{store.name}</td>
                    <td className="px-4 py-2 text-stone-600 font-mono text-xs">{store.store_type}</td>
                    <td className="px-4 py-2">
                      {hasEnricher ? (
                        <span className="text-green-700">Yes</span>
                      ) : (
                        <span className="text-stone-400" title="No PDP enricher — backlog may not decrease via enrich">
                          No
                        </span>
                      )}
                    </td>
                    <td className={`px-4 py-2 text-right font-medium ${store.count > 0 ? "text-amber-700" : "text-stone-500"}`}>
                      {store.count.toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="rounded border border-stone-200 bg-stone-50 px-4 py-3 text-xs text-stone-600">
        <p className="font-medium text-stone-700 mb-1">When to increase enrich frequency</p>
        <ul className="list-disc pl-4 space-y-0.5">
          <li>Backlog grows after each scrape cycle and enrich jobs process fewer listings than backlog size</li>
          <li>Freshness skews toward &quot;1–7 days&quot; or older while scrapes run every few hours</li>
          <li>One store dominates backlog — check enricher support or store-specific issues</li>
        </ul>
      </div>
    </div>
  );
}
