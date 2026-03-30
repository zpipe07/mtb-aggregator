/**
 * Build `/deals` list path from Next.js page `searchParams` (same shape as `await searchParams`).
 */
export function searchParamsRecordToDealsListPath(
  record: Record<string, string | string[] | undefined>
): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(record)) {
    if (value === undefined || value === "") continue;
    if (Array.isArray(value)) {
      value.forEach((v) => {
        if (v !== "") qs.append(key, v);
      });
    } else {
      qs.set(key, value);
    }
  }
  const s = qs.toString();
  return s ? `/deals?${s}` : "/deals";
}

/**
 * Build deals list path for `/deals/c/...` routes: pathname + query (category is in the path, not `category=`).
 */
export function searchParamsRecordToDealsCategoryListPath(
  pathname: string,
  record: Record<string, string | string[] | undefined>
): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(record)) {
    if (key === "category") continue;
    if (value === undefined || value === "") continue;
    if (Array.isArray(value)) {
      value.forEach((v) => {
        if (v !== "") qs.append(key, v);
      });
    } else {
      qs.set(key, value);
    }
  }
  const s = qs.toString();
  return s ? `${pathname}?${s}` : pathname;
}

/** Safe internal back target for deal detail "Back to deals" (`/deals`, `/deals?...`, or `/deals/c/...`). */
export function sanitizeDealsListBackHref(
  raw: string | null | undefined
): string {
  if (raw == null || raw === "") return "/deals";
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // use raw
  }
  try {
    const u = new URL(decoded, "http://localhost");
    if (u.pathname === "/deals" || u.pathname.startsWith("/deals/c/")) {
      return `${u.pathname}${u.search}`;
    }
    return "/deals";
  } catch {
    return "/deals";
  }
}

export function buildDealDetailHref(dealId: number, dealsListPath: string): string {
  return `/deals/${dealId}?from=${encodeURIComponent(dealsListPath)}`;
}
