import { timingSafeEqual } from "crypto";

/** Validate `Authorization: Bearer <ADMIN_PASSWORD>` (same secret as the Go API admin). */
export function validateAdminBearer(authHeader: string | null): boolean {
  const expected = process.env.ADMIN_PASSWORD?.trim() ?? "";
  if (!expected || !authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.slice("Bearer ".length).trim();
  if (token.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}
