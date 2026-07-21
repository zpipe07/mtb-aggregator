/**
 * Normalize a user-entered path or full site URL into a site-relative path
 * suitable for `revalidatePath` (pathname + optional search).
 */
export function parseRevalidateTarget(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Path is required");
  }

  let path: string;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      throw new Error("Invalid URL");
    }
    path = url.pathname + url.search;
  } else {
    path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  }

  if (path.includes("://") || path.startsWith("//")) {
    throw new Error("Only site-relative paths are allowed");
  }
  if (path.includes("..")) {
    throw new Error("Path must not contain '..'");
  }

  return path;
}
