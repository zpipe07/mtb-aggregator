import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
    const { createLogger } = await import("@mtb-aggregator/logging");
    createLogger({ service: "web", component: "startup" }).info({
      msg: "next.js server runtime initialized",
      node_env: process.env.NODE_ENV ?? "development",
    });
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
