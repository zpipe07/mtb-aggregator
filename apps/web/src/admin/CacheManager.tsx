"use client";

import { useState } from "react";
import { PUBLIC_DATA_CACHE_TAG, PUBLIC_ISR_REVALIDATE_SECONDS } from "@/lib/revalidate";
import { useRevalidateCache } from "./hooks/mutations";

const PRESET_PATHS = [
  { label: "Home", path: "/" },
  { label: "All deals", path: "/deals" },
  { label: "Price drops", path: "/deals?sort=price_drop" },
  { label: "Categories hub", path: "/categories" },
] as const;

const HOURS = PUBLIC_ISR_REVALIDATE_SECONDS / 3600;

export function CacheManager() {
  const [pathInput, setPathInput] = useState("/deals?sort=price_drop");
  const [useLayout, setUseLayout] = useState(false);
  const [alsoPurgeFetchCache, setAlsoPurgeFetchCache] = useState(true);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const revalidateMutation = useRevalidateCache();

  function runRevalidate(opts: {
    path?: string;
    paths?: string[];
    tags?: string[];
    type?: "page" | "layout";
    purge_all?: boolean;
  }) {
    setLastResult(null);
    revalidateMutation.mutate(opts, {
      onSuccess: (data) => {
        const parts: string[] = [];
        if (data.purged_all) {
          parts.push("entire site");
        }
        if (data.revalidated_paths.length > 0) {
          parts.push(`paths: ${data.revalidated_paths.join(", ")}`);
        }
        if (data.revalidated_queries && data.revalidated_queries.length > 0) {
          parts.push(
            `requested URLs: ${data.revalidated_queries.join(", ")} (revalidated by pathname)`,
          );
        }
        if (data.revalidated_tags.length > 0) {
          parts.push(`tags: ${data.revalidated_tags.join(", ")}`);
        }
        setLastResult(
          parts.length > 0
            ? `Cache cleared (${parts.join("; ")}). Hard-refresh the page (or open in a private window) to verify.`
            : "Cache cleared.",
        );
      },
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const tags = alsoPurgeFetchCache ? [PUBLIC_DATA_CACHE_TAG] : undefined;
    runRevalidate({
      path: pathInput,
      type: useLayout ? "layout" : "page",
      tags,
    });
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-stone-800 mb-1">Cache</h2>
      <p className="text-sm text-stone-600 mb-6 max-w-2xl">
        Public pages use {HOURS}-hour ISR. After a deploy, stale HTML or API fetch
        cache can hide new behavior until the next scheduled revalidation. Enter a
        path or full URL — query params (e.g.{" "}
        <code className="text-stone-700">?sort=price_drop</code>) are accepted for
        reference, but Next.js clears cache by <strong>pathname</strong> only (all
        filter/sort variants of <code className="text-stone-700">/deals</code>{" "}
        share one route cache).
      </p>

      {(revalidateMutation.isError || lastResult) && (
        <div
          className={`mb-4 rounded border px-3 py-2 text-sm ${
            revalidateMutation.isError
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : "border-green-200 bg-green-50 text-green-800"
          }`}
        >
          {revalidateMutation.isError
            ? (revalidateMutation.error?.message ?? "Revalidation failed")
            : lastResult}
        </div>
      )}

      <div className="mb-6 rounded-lg border border-stone-200 bg-white p-4 shadow-sm max-w-2xl">
        <h3 className="text-sm font-medium text-stone-800 mb-2">
          Clear cache for a path
        </h3>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label
              htmlFor="cache-path"
              className="block text-xs text-stone-500 mb-1"
            >
              Path or full URL
            </label>
            <input
              id="cache-path"
              type="text"
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
              placeholder="/deals?sort=price_drop"
              className="w-full rounded border border-stone-300 px-3 py-2 text-sm text-stone-900 font-mono"
            />
            <p className="mt-1 text-xs text-stone-500">
              Example: <code className="text-stone-600">/deals?sort=price_drop</code>{" "}
              clears the <code className="text-stone-600">/deals</code> route (all
              sort/filter variants).
            </p>
          </div>
          <div className="flex flex-col gap-2 text-sm text-stone-700">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={alsoPurgeFetchCache}
                onChange={(e) => setAlsoPurgeFetchCache(e.target.checked)}
                className="rounded border-stone-300"
              />
              Also purge API fetch cache tag{" "}
              <code className="text-xs bg-stone-100 px-1 rounded">
                {PUBLIC_DATA_CACHE_TAG}
              </code>
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={useLayout}
                onChange={(e) => setUseLayout(e.target.checked)}
                className="rounded border-stone-300"
              />
              Revalidate as layout (includes nested routes under this path)
            </label>
          </div>
          <button
            type="submit"
            disabled={revalidateMutation.isPending || !pathInput.trim()}
            className="self-start rounded bg-stone-800 px-3 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
          >
            {revalidateMutation.isPending ? "Clearing…" : "Clear cache"}
          </button>
        </form>
      </div>

      <div className="mb-6 rounded-lg border border-stone-200 bg-white p-4 shadow-sm max-w-2xl">
        <h3 className="text-sm font-medium text-stone-800 mb-2">Quick presets</h3>
        <div className="flex flex-wrap gap-2">
          {PRESET_PATHS.map(({ label, path }) => (
            <button
              key={path}
              type="button"
              onClick={() => {
                setPathInput(path);
                runRevalidate({
                  path,
                  tags: [PUBLIC_DATA_CACHE_TAG],
                });
              }}
              disabled={revalidateMutation.isPending}
              className="rounded border border-stone-300 px-3 py-1.5 text-sm text-stone-800 hover:bg-stone-50 disabled:opacity-50"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm max-w-2xl">
        <h3 className="text-sm font-medium text-stone-800 mb-1">
          Purge all public API fetch cache
        </h3>
        <p className="text-xs text-stone-500 mb-3">
          Invalidates cached responses from <code className="text-stone-600">GET /deals</code>,{" "}
          facets, categories, and related public endpoints. Does not clear every
          page shell — combine with path revalidation above when needed.
        </p>
        <button
          type="button"
          onClick={() =>
            runRevalidate({
              tags: [PUBLIC_DATA_CACHE_TAG],
            })
          }
          disabled={revalidateMutation.isPending}
          className="rounded bg-stone-800 px-3 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
        >
          {revalidateMutation.isPending ? "Clearing…" : `Purge tag: ${PUBLIC_DATA_CACHE_TAG}`}
        </button>
      </div>

      <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 shadow-sm max-w-2xl">
        <h3 className="text-sm font-medium text-amber-900 mb-1">
          Purge entire site
        </h3>
        <p className="text-xs text-amber-800 mb-3">
          Nuclear option: invalidates all public page caches. Use when a deploy
          changed shared layout or many routes at once.
        </p>
        <button
          type="button"
          onClick={() =>
            runRevalidate({
              tags: [PUBLIC_DATA_CACHE_TAG],
              purge_all: true,
            })
          }
          disabled={revalidateMutation.isPending}
          className="rounded border border-amber-400 bg-white px-3 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
        >
          {revalidateMutation.isPending ? "Clearing…" : "Purge all pages + API cache"}
        </button>
      </div>
    </div>
  );
}
