import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/logger", () => ({
  log: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { rateLimit } from "../middleware/rate-limit";
import type { Request, Response, NextFunction } from "express";

function mockReq(ip = "127.0.0.1"): Partial<Request> {
  return { ip, headers: {} };
}

function mockRes(): Partial<Response> & { statusCode: number; body: unknown; headers: Record<string, string | number> } {
  const res: Record<string, unknown> = {
    statusCode: 200,
    body: null,
    headers: {} as Record<string, string | number>,
  };
  res.setHeader = (name: string, value: string | number) => {
    (res.headers as Record<string, string | number>)[name] = value;
    return res;
  };
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body: unknown) => {
    res.body = body;
    return res;
  };
  return res as Partial<Response> & { statusCode: number; body: unknown; headers: Record<string, string | number> };
}

describe("rateLimit middleware", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("allows requests within the limit", () => {
    const limiter = rateLimit({ windowMs: 60000, max: 3, keyPrefix: "test-allow" });
    const req = mockReq("10.0.0.1");
    const next = vi.fn();

    for (let i = 0; i < 3; i++) {
      const res = mockRes();
      limiter(req as Request, res as unknown as Response, next as NextFunction);
    }

    expect(next).toHaveBeenCalledTimes(3);
  });

  it("blocks requests over the limit with 429", () => {
    const limiter = rateLimit({ windowMs: 60000, max: 2, keyPrefix: "test-block" });
    const req = mockReq("10.0.0.2");
    const next = vi.fn();

    // First 2 should pass
    for (let i = 0; i < 2; i++) {
      const res = mockRes();
      limiter(req as Request, res as unknown as Response, next as NextFunction);
    }
    expect(next).toHaveBeenCalledTimes(2);

    // 3rd should be blocked
    const res = mockRes();
    limiter(req as Request, res as unknown as Response, next as NextFunction);
    expect(res.statusCode).toBe(429);
    expect(next).toHaveBeenCalledTimes(2);
    expect(res.headers["Retry-After"]).toBeDefined();
  });

  it("sets X-RateLimit headers", () => {
    const limiter = rateLimit({ windowMs: 60000, max: 5, keyPrefix: "test-headers" });
    const req = mockReq("10.0.0.3");
    const res = mockRes();
    const next = vi.fn();

    limiter(req as Request, res as unknown as Response, next as NextFunction);

    expect(res.headers["X-RateLimit-Limit"]).toBe(5);
    expect(res.headers["X-RateLimit-Remaining"]).toBe(4);
    expect(res.headers["X-RateLimit-Reset"]).toBeDefined();
  });

  it("resets after window expires", () => {
    const limiter = rateLimit({ windowMs: 1000, max: 1, keyPrefix: "test-reset" });
    const req = mockReq("10.0.0.4");
    const next = vi.fn();

    const res1 = mockRes();
    limiter(req as Request, res1 as unknown as Response, next as NextFunction);
    expect(next).toHaveBeenCalledTimes(1);

    // Exhaust the limit
    const res2 = mockRes();
    limiter(req as Request, res2 as unknown as Response, next as NextFunction);
    expect(res2.statusCode).toBe(429);

    // Advance past window
    vi.advanceTimersByTime(1001);

    const res3 = mockRes();
    limiter(req as Request, res3 as unknown as Response, next as NextFunction);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it("tracks different IPs separately", () => {
    const limiter = rateLimit({ windowMs: 60000, max: 1, keyPrefix: "test-ip" });
    const next = vi.fn();

    const req1 = mockReq("10.0.0.5");
    const res1 = mockRes();
    limiter(req1 as Request, res1 as unknown as Response, next as NextFunction);

    const req2 = mockReq("10.0.0.6");
    const res2 = mockRes();
    limiter(req2 as Request, res2 as unknown as Response, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(2);
  });
});
