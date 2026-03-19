import * as Sentry from "@sentry/node";

type RouteTag = "scrape" | "enrich" | "scrape-debug";

/** Report route failures to Sentry (Express catch blocks do not call next(err)). */
export function captureRouteError(
  err: unknown,
  ctx: { route: RouteTag; store?: string; url?: string },
): void {
  Sentry.withScope((scope) => {
    scope.setTag("route", ctx.route);
    if (ctx.store) scope.setTag("store", ctx.store);
    if (ctx.url) scope.setExtra("url", ctx.url);
    Sentry.captureException(err);
  });
}
