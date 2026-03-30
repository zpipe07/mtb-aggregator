/**
 * Canonical site origin for metadata (`metadataBase`, Open Graph, canonical URLs).
 *
 * - Production: set `NEXT_PUBLIC_SITE_URL` (e.g. `https://example.com`).
 * - Vercel preview/production: falls back to `VERCEL_URL` with `https`.
 * - Local dev: `http://localhost:3000` (override with `NEXT_PUBLIC_SITE_URL` if your dev port differs).
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
