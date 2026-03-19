// Client-side Sentry (browser). Env vars below are injected via next.config.ts for Vercel/Git SHA.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || undefined,
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE || undefined,

  tracesSampleRate: 0,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
