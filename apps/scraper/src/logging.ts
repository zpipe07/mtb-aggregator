import type { NextFunction, Request, Response } from "express";
import {
  clientIp,
  createLogger,
  httpAccessEnabled,
  logHttpAccess,
  requestId,
} from "@mtb-aggregator/logging";

export const scraperLogger = createLogger({ service: "scraper", component: "scraper" });
export const startupLogger = createLogger({ service: "scraper", component: "startup" });
export const securityLogger = createLogger({ service: "scraper", component: "security" });

export function scraperAccessMiddleware() {
  if (!httpAccessEnabled()) {
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }
  const httpLogger = createLogger({ service: "scraper", component: "http" });
  return (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on("finish", () => {
      if (req.path === "/health") return;
      logHttpAccess(httpLogger, {
        method: req.method,
        path: req.originalUrl || req.url,
        status: res.statusCode,
        duration_ms: Date.now() - start,
        client_ip: clientIp(req.headers, req.socket.remoteAddress),
        request_id: requestId(req.headers),
      });
    });
    next();
  };
}
