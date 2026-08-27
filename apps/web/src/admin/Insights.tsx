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
import { usePipelineMetrics, useEnrichmentStepMetrics } from "./hooks/queries";
import { formatCount, stepDueCount } from "./insightsMetrics";

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

function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || seconds < 0) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
}

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function isInCooldown(until: string | null | undefined): boolean {
  if (!until) return false;
  return new Date(until).getTime() > Date.now();
}

function freshnessChartData(freshness: {
  never_fetched: number;
  lt_24h: number;
  d1_7: number;
  d7_30: number;
  gt_30d: number;
}) {
  return [
    { label: "Never fetched", count: freshness.never_fetched },
    { label: "< 24 hours", count: freshness.lt_24h },
    { label: "1–7 days", count: freshness.d1_7 },
    { label: "7–30 days", count: freshness.d7_30 },
    { label: "> 30 days", count: freshness.gt_30d },
  ];
}

function eventThroughputChartData(
  rows: { date: string; pdp: number; classify: number; extract: number }[],
) {
  return rows.map((row) => ({
    ...row,
    dateLabel: formatDateLabel(row.date),
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
  const { data: stepMetrics } = useEnrichmentStepMetrics(Math.min(days, 30));

  const freshnessData = useMemo(
    () => (data ? freshnessChartData(data.freshness) : []),
    [data],
  );
  const throughputChartData = useMemo(
    () => (data ? eventThroughputChartData(data.event_throughput) : []),
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

  const { latency, freshness, stores } = data!;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-stone-800">Insights</h2>
          <p className="text-sm text-stone-500 mt-1">
            Enrichment pipeline flow — scrape to fully enriched latency, step gauges, and PDP drainer health.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-stone-500">Metrics window</span>
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
          <p className="text-sm text-stone-500">Scrape → extract p50</p>
          <p className="text-2xl font-semibold text-stone-800">
            {formatDuration(latency.p50_seconds)}
          </p>
          <p className="text-xs text-stone-400">
            {latency.sample_count.toLocaleString()} successful extracts in window
          </p>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-stone-500">Scrape → extract p95</p>
          <p className="text-2xl font-semibold text-stone-800">
            {formatDuration(latency.p95_seconds)}
          </p>
          <p className="text-xs text-stone-400">
            Listings without a profile are not in this sample
          </p>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-stone-500">PDP never fetched</p>
          <p className="text-2xl font-semibold text-amber-700">
            {freshness.never_fetched.toLocaleString()}
          </p>
          <p className="text-xs text-stone-400">Enricher-store in-stock listings</p>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-stone-500">Enricher listings</p>
          <p className="text-2xl font-semibold text-stone-800">
            {freshness.in_stock_total.toLocaleString()}
          </p>
          <p className="text-xs text-stone-400">In-stock, visible deals</p>
        </div>
      </div>

      {stepMetrics && stepMetrics.steps.length > 0 ? (
        <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-medium text-stone-800 mb-1">
            Enrichment step flow
          </h3>
          <p className="text-xs text-stone-500 mb-4">
            Due / in-flight / dead and success rates over the last {stepMetrics.days} days. Low-confidence
            classifications: {formatCount(stepMetrics.low_confidence_count)}.
          </p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-stone-500 border-b border-stone-200">
                  <th className="py-2 pr-4 font-medium">Step</th>
                  <th className="py-2 pr-4 font-medium">Due</th>
                  <th className="py-2 pr-4 font-medium">In flight</th>
                  <th className="py-2 pr-4 font-medium">Dead</th>
                  <th className="py-2 pr-4 font-medium">Oldest due</th>
                  <th className="py-2 pr-4 font-medium">Success rate</th>
                  <th className="py-2 pr-4 font-medium">Failures</th>
                  <th className="py-2 font-medium">Skipped</th>
                </tr>
              </thead>
              <tbody>
                {stepMetrics.steps.map((s) => (
                  <tr key={s.step} className="border-b border-stone-100">
                    <td className="py-2 pr-4 capitalize">{s.step}</td>
                    <td className="py-2 pr-4">{formatCount(stepDueCount(s))}</td>
                    <td className="py-2 pr-4">{formatCount(s.in_flight)}</td>
                    <td className="py-2 pr-4">{formatCount(s.dead)}</td>
                    <td className="py-2 pr-4">
                      {formatDuration(s.oldest_due_age_seconds)}
                    </td>
                    <td className="py-2 pr-4">
                      {(s.success_count ?? 0) + (s.failure_count ?? 0) > 0
                        ? `${(s.success_rate_pct ?? 0).toFixed(1)}%`
                        : "—"}
                    </td>
                    <td className="py-2 pr-4">{formatCount(s.failure_count)}</td>
                    <td className="py-2">{formatCount(s.skipped_count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {stepMetrics.confidence_histogram.length > 0 ? (
            <ul className="mt-4 flex flex-wrap gap-3 text-xs text-stone-600">
              {stepMetrics.confidence_histogram.map((b) => (
                <li key={b.label}>
                  {b.label}: {b.count.toLocaleString()}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-medium text-stone-800 mb-1">PDP freshness</h3>
          <p className="text-xs text-stone-500 mb-4">
            Age of last PDP fetch (<code className="text-stone-600">pdp_fetched_at</code>) for enricher listings
          </p>
          {freshnessData.some((d) => d.count > 0) ? (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={freshnessData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip formatter={(v) => [v != null ? Number(v).toLocaleString() : "", "Listings"]} />
                  <Bar dataKey="count" fill="#57534e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-stone-500 py-8 text-center">No enricher listings yet.</p>
          )}
        </section>

        <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-medium text-stone-800 mb-1">Enrichment throughput</h3>
          <p className="text-xs text-stone-500 mb-4">
            Daily successful steps from enrichment events (last {days} days)
          </p>
          {throughputChartData.length > 0 ? (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={throughputChartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="dateLabel" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="pdp" name="PDP" stroke="#78716c" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="classify" name="Classify" stroke="#2563eb" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="extract" name="Extract" stroke="#16a34a" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-stone-500 py-8 text-center">No enrichment events in this window.</p>
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
                <Tooltip formatter={(v) => [v != null ? Number(v).toLocaleString() : "", "Upserted"]} />
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
          <h3 className="text-sm font-medium text-stone-800">PDP drainer by store</h3>
          <p className="text-xs text-stone-500 mt-0.5">
            Due listings, in-flight claims, and persistent cooldown state per enricher store
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50 text-left text-stone-600">
                <th className="px-4 py-2 font-medium">Store</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium text-right">PDP due</th>
                <th className="px-4 py-2 font-medium text-right">In flight</th>
                <th className="px-4 py-2 font-medium">Last fetch</th>
                <th className="px-4 py-2 font-medium">Cooldown</th>
                <th className="px-4 py-2 font-medium text-right">Failures</th>
              </tr>
            </thead>
            <tbody>
              {stores.map((store) => {
                const cooled = isInCooldown(store.pdp_cooldown_until);
                return (
                  <tr key={store.store_id} className="border-b border-stone-100">
                    <td className="px-4 py-2 text-stone-800">{store.name}</td>
                    <td className="px-4 py-2 text-stone-600 font-mono text-xs">{store.store_type}</td>
                    <td className={`px-4 py-2 text-right font-medium ${store.pdp_due > 0 ? "text-amber-700" : "text-stone-500"}`}>
                      {store.pdp_due.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-right text-stone-600">
                      {store.pdp_in_flight.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-stone-600 text-xs">
                      {formatTimestamp(store.pdp_last_fetch_at)}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {cooled ? (
                        <span className="text-red-700 font-medium">
                          Until {formatTimestamp(store.pdp_cooldown_until)}
                        </span>
                      ) : (
                        <span className="text-stone-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right text-stone-600">
                      {store.pdp_consecutive_failures > 0
                        ? store.pdp_consecutive_failures.toLocaleString()
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="rounded border border-stone-200 bg-stone-50 px-4 py-3 text-xs text-stone-600">
        <p className="font-medium text-stone-700 mb-1">When the pipeline needs attention</p>
        <ul className="list-disc pl-4 space-y-0.5">
          <li>Scrape→extract p95 climbing while scrapes run on schedule</li>
          <li>Oldest-due age growing on PDP or classify steps</li>
          <li>Stores in cooldown (circuit breaker tripped) — check Sentry and WAF/rate limits</li>
          <li>In-flight counts stuck above zero — may indicate crashed workers or long PDP timeouts</li>
        </ul>
      </div>
    </div>
  );
}
