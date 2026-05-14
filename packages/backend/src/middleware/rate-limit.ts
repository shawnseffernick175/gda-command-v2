/**
 * In-memory rate limiter — sliding window per IP.
 * No external dependencies. Configurable window and max requests.
 */

import { Request, Response, NextFunction } from "express";
import { log } from "../lib/logger";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) store.delete(key);
  }
}, 5 * 60 * 1000).unref();

interface RateLimitOptions {
  windowMs: number;
  max: number;
  keyPrefix?: string;
}

export function rateLimit(opts: RateLimitOptions) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.ip ?? "unknown";
    const key = `${opts.keyPrefix ?? "rl"}:${ip}`;
    const now = Date.now();

    let entry = store.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + opts.windowMs };
      store.set(key, entry);
    }

    entry.count++;

    const remaining = Math.max(0, opts.max - entry.count);
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);

    res.setHeader("X-RateLimit-Limit", opts.max);
    res.setHeader("X-RateLimit-Remaining", remaining);
    res.setHeader("X-RateLimit-Reset", Math.ceil(entry.resetAt / 1000));

    if (entry.count > opts.max) {
      log.warn("rate_limit_exceeded", { ip, key, count: entry.count, max: opts.max });
      res.setHeader("Retry-After", retryAfter);
      res.status(429).json({
        success: false,
        error: {
          code: "RATE_LIMITED",
          message: `Too many requests. Try again in ${retryAfter} seconds.`,
        },
      });
      return;
    }

    next();
  };
}

// Pre-configured limiters
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 minutes
  max: 30,                      // 30 login/register attempts per 15min
  keyPrefix: "auth",
});

export const sessionLimiter = rateLimit({
  windowMs: 60 * 1000,          // 1 minute
  max: 600,                     // 600/min — /api/auth/me is called on every page load
  keyPrefix: "session",
});

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,          // 1 minute
  max: 600,                     // 600 requests per minute (normal browsing)
  keyPrefix: "api",
});

export const ingestLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,                     // higher limit for n8n data ingestion
  keyPrefix: "ingest",
});
