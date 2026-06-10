/**
 * API base URL helper. Use for both client and server.
 * - Client: NEXT_PUBLIC_API_URL or /api (relative, uses Next.js rewrite)
 * - Server / build: API_URL or NEXT_PUBLIC_API_URL (must be absolute) or http://localhost:8080
 */
export function getApiBase(): string {
  if (typeof window !== "undefined") {
    return process.env.NEXT_PUBLIC_API_URL || "/api";
  }
  return (
    process.env.API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:8080"
  );
}
