export type ParsedRevalidateTarget = {
  /** Pathname only — this is what Next.js `revalidatePath` uses. */
  pathname: string;
  /** Query string including `?`, or empty when absent. For display only. */
  search: string;
};

/**
 * Normalize a user-entered path or full site URL.
 *
 * Next.js `revalidatePath` matches route segments only — query strings are
 * ignored and must not be passed through or the wrong cache tag is invalidated.
 */
export function parseRevalidateTarget(input: string): ParsedRevalidateTarget {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Path is required");
  }

  let pathname: string;
  let search = "";

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      throw new Error("Invalid URL");
    }
    pathname = url.pathname;
    search = url.search;
  } else {
    const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
    const qIndex = path.indexOf("?");
    if (qIndex === -1) {
      pathname = path;
    } else {
      pathname = path.slice(0, qIndex) || "/";
      search = path.slice(qIndex);
    }
  }

  if (pathname.includes("://") || pathname.startsWith("//")) {
    throw new Error("Only site-relative paths are allowed");
  }
  if (pathname.includes("..")) {
    throw new Error("Path must not contain '..'");
  }

  return { pathname, search };
}
