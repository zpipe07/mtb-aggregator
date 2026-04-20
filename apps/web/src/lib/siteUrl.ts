/**
 * Canonical site origin for metadata (`metadataBase`, Open Graph, canonical URLs).
 *
 * - **Production (Vercel):** `NEXT_PUBLIC_SITE_URL` must be set (e.g. `https://thedropper.shop`). We intentionally
 *   do not fall back to `VERCEL_URL` in production — that value is the deployment hostname and poisons canonicals
 *   and sitemap `<loc>` URLs if unset.
 * - **Preview (Vercel):** when `NEXT_PUBLIC_SITE_URL` is unset, falls back to `https://${VERCEL_URL}`.
 * - **Local dev:** `http://localhost:3000` when unset (override with `NEXT_PUBLIC_SITE_URL` if your port differs).
 */
export function getSiteUrl(): URL {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) {
    try {
      const u = explicit.replace(/\/$/, "");
      return new URL(u);
    } catch {
      // fall through
    }
  }
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv === "production") {
    throw new Error(
      "NEXT_PUBLIC_SITE_URL must be set in production (got undefined). Canonical URLs and sitemap depend on it.",
    );
  }
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    const host = vercel.replace(/^https?:\/\//, "");
    return new URL(`https://${host}`);
  }
  return new URL("http://localhost:3000");
}

/** Absolute URL string for a path starting with `/`. */
export function absoluteUrl(path: string): string {
  const base = getSiteUrl();
  const p = path.startsWith("/") ? path : `/${path}`;
  return new URL(p, base).toString();
}
