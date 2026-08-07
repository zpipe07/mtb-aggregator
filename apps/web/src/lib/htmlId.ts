/**
 * Sanitize a string for use as part of an HTML `id` attribute fragment (e.g. with `useId()` prefix).
 */
export function sanitizeForHtmlId(fragment: string): string {
  const s = fragment.replace(/\W+/g, "-").replace(/^-+|-+$/g, "");
  return s.length > 0 ? s : "field";
}
