import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

export interface LogEntry {
  ts: string;
  level: "info" | "warn" | "error" | "debug";
  msg: string;
  correlationId?: string;
  method?: string;
  path?: string;
  status?: number;
  durationMs?: number;
  [key: string]: unknown;
}

function write(entry: LogEntry) {
  const stream = entry.level === "error" ? process.stderr : process.stdout;
  stream.write(JSON.stringify(entry) + "\n");
}

export const log = {
  info(msg: string, extra?: Record<string, unknown>) {
    write({ ts: new Date().toISOString(), level: "info", msg, ...extra });
  },
  warn(msg: string, extra?: Record<string, unknown>) {
    write({ ts: new Date().toISOString(), level: "warn", msg, ...extra });
  },
  error(msg: string, extra?: Record<string, unknown>) {
    write({ ts: new Date().toISOString(), level: "error", msg, ...extra });
  },
  debug(msg: string, extra?: Record<string, unknown>) {
    if (process.env.LOG_LEVEL === "debug") {
      write({ ts: new Date().toISOString(), level: "debug", msg, ...extra });
    }
  },
};

/**
 * Express middleware that assigns a correlation ID to each request
 * and logs structured request/response data.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const correlationId = (req.headers["x-correlation-id"] as string) ?? randomUUID();
  req.headers["x-correlation-id"] = correlationId;
  res.setHeader("X-Correlation-Id", correlationId);

  const start = Date.now();

  res.on("finish", () => {
    const durationMs = Date.now() - start;
    const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
    write({
      ts: new Date().toISOString(),
      level,
      msg: `${req.method} ${req.path}`,
      correlationId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs,
      userAgent: req.headers["user-agent"]?.slice(0, 100),
    });
  });

  next();
}
