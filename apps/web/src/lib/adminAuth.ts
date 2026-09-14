import { timingSafeEqual } from "crypto";

export function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

function validateBearerSecret(
  authHeader: string | null,
  secret: string | undefined,
): boolean {
  const expected = secret?.trim() ?? "";
  if (!expected || !authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.slice("Bearer ".length).trim();
  return timingSafeEqualString(token, expected);
}

/** Validate `Authorization: Bearer <ADMIN_PASSWORD>` (same secret as the Go API admin). */
export function validateAdminBearer(authHeader: string | null): boolean {
  return validateBearerSecret(authHeader, process.env.ADMIN_PASSWORD);
}

/** Validate `Authorization: Bearer <CRON_SECRET>` (Vercel Cron). */
export function validateCronBearer(authHeader: string | null): boolean {
  return validateBearerSecret(authHeader, process.env.CRON_SECRET);
}

/** `X-Cron-Secret` header used by the Go API / cron-job.org. */
export function validateCronSecretHeader(header: string | null): boolean {
  const expected = process.env.CRON_SECRET?.trim() ?? "";
  const got = header?.trim() ?? "";
  if (!expected || !got) return false;
  return timingSafeEqualString(got, expected);
}
