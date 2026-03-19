import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Expose release/environment to the browser bundle (Sentry client + Vercel git SHA)
  env: {
    NEXT_PUBLIC_SENTRY_RELEASE:
      process.env.NEXT_PUBLIC_SENTRY_RELEASE ||
      process.env.SENTRY_RELEASE ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      "",
    NEXT_PUBLIC_SENTRY_ENVIRONMENT:
      process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ||
      process.env.SENTRY_ENVIRONMENT ||
      process.env.VERCEL_ENV ||
      "",
  },
  // Proxy /api to Go backend in dev; in prod, set API_URL and use rewrites if needed
  async rewrites() {
    const apiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;
    if (apiUrl && apiUrl !== "/api") {
      return [
        {
          source: "/api/:path*",
          destination: `${apiUrl.replace(/\/$/, "")}/:path*`,
        },
      ];
    }
    // Dev: proxy to local Go API
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:8080/:path*",
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  telemetry: false,
  // Skip webpack source-map upload locally / without a token
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
});
