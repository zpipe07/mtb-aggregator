/**
 * Load env first, then initialize Sentry before Express is imported.
 * @see https://docs.sentry.io/platforms/javascript/guides/express/
 */
import "./load-env.js";
import * as Sentry from "@sentry/node";

const dsn = process.env.SENTRY_DSN?.trim();
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || undefined,
    release:
      (process.env.SENTRY_RELEASE || process.env.RENDER_GIT_COMMIT || "").trim() ||
      undefined,
    tracesSampleRate: 0,
    integrations: [Sentry.expressIntegration()],
  });
}
