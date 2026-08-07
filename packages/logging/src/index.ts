import pino, { type Logger, type LoggerOptions } from "pino";

export type LogService = "api" | "scraper" | "web";

export type CreateLoggerOptions = {
  service: LogService;
  component: string;
};

function parseLevel(): pino.Level {
  const raw = String(process.env.LOG_LEVEL ?? "info").toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    return raw;
  }
  return "info";
}

function parseFormat(): "json" | "text" {
  const raw = String(process.env.LOG_FORMAT ?? "json").toLowerCase();
  return raw === "text" ? "text" : "json";
}

export function httpAccessEnabled(): boolean {
  const raw = String(process.env.LOG_HTTP_ACCESS ?? "auto").toLowerCase();
  if (raw === "on" || raw === "true" || raw === "1") return true;
  if (raw === "off" || raw === "false" || raw === "0") return false;
  if (String(process.env.RENDER ?? "").toLowerCase() === "true") return false;
  if (String(process.env.VERCEL ?? "") === "1") return false;
  return true;
}

function baseOptions(): LoggerOptions {
  return {
    level: parseLevel(),
    messageKey: "msg",
    timestamp: () => `,"ts":"${new Date().toISOString()}"`,
    formatters: {
      level: (label) => ({ level: label }),
    },
    base: undefined,
  };
}

function createDestination() {
  if (parseFormat() === "text") {
    return pino.destination({
      sync: false,
      write(data: string) {
        try {
          const obj = JSON.parse(data) as Record<string, unknown>;
          process.stdout.write(formatTextLine(obj) + "\n");
        } catch {
          process.stdout.write(data);
        }
      },
    });
  }
  return pino.destination({ sync: false });
}

let rootLogger: Logger | undefined;

function getRootLogger(): Logger {
  if (!rootLogger) {
    rootLogger = pino(baseOptions(), createDestination());
  }
  return rootLogger;
}

export function createLogger({ service, component }: CreateLoggerOptions): Logger {
  return getRootLogger().child({ service, component });
}

export function formatTextLine(obj: Record<string, unknown>): string {
  const order = ["ts", "level", "service", "component", "msg"];
  const parts: string[] = [];
  for (const key of order) {
    if (obj[key] !== undefined) {
      parts.push(`${key}=${formatValue(obj[key])}`);
    }
  }
  for (const [key, value] of Object.entries(obj)) {
    if (!order.includes(key)) {
      parts.push(`${key}=${formatValue(value)}`);
    }
  }
  return parts.join(" ");
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export type HttpAccessFields = {
  method: string;
  path: string;
  status: number;
  duration_ms: number;
  client_ip?: string;
  request_id?: string;
};

export function logHttpAccess(logger: Logger, fields: HttpAccessFields): void {
  logger.info({ ...fields, msg: "request" });
}

export function clientIp(headers: Record<string, string | string[] | undefined>, remoteAddress?: string): string {
  const xff = headerValue(headers["x-forwarded-for"]);
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const xri = headerValue(headers["x-real-ip"]);
  if (xri) return xri;
  if (remoteAddress) {
    const host = remoteAddress.replace(/:\d+$/, "");
    return host || remoteAddress;
  }
  return "unknown";
}

function headerValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0]?.trim() ?? "";
  return value?.trim() ?? "";
}

export function requestId(headers: Record<string, string | string[] | undefined>): string | undefined {
  for (const key of ["x-request-id", "rndr-id", "render-request-id"]) {
    const value = headerValue(headers[key]);
    if (value) return value;
  }
  return undefined;
}
