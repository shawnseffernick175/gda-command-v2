/**
 * Sentinel route auth tests.
 *
 * Verifies the three auth paths per PR #316 spec:
 *   GET  /api/sentinel/current  → no auth (public)
 *   GET  /api/sentinel/history  → JWT required
 *   POST /api/sentinel/run      → x-gda-key required
 *
 * Uses a minimal Express app with the same middleware structure as server.ts
 * to prove the global authMiddleware skips sentinel routes correctly.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

const TEST_JWT_SECRET = "test-jwt-secret";
const TEST_WEBHOOK_KEY = "test-gda-webhook-key-abc123";

// Must set env BEFORE auth.ts is loaded — JWT_SECRET is captured at module level.
vi.hoisted(() => {
  process.env.JWT_SECRET = "test-jwt-secret";
  process.env.AUTH_REQUIRED = "true";
  process.env.GDA_WEBHOOK_KEY = "test-gda-webhook-key-abc123";
});

import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";

// Mock DB pool — sentinel routes query system_health_snapshots
vi.mock("../lib/db", () => ({
  getPool: () => ({
    query: vi.fn().mockResolvedValue({
      rows: [
        {
          id: 1,
          taken_at: new Date().toISOString(),
          overall_status: "healthy",
          components: [],
          failing_count: 0,
          reason: "all green",
          meta: {},
        },
      ],
    }),
  }),
}));

// Mock runSentinel — avoid real probes
vi.mock("../lib/health-sentinel", () => ({
  runSentinel: vi.fn().mockResolvedValue({
    id: 99,
    taken_at: new Date().toISOString(),
    overall_status: "healthy",
    components: [],
    failing_count: 0,
    reason: "all green",
  }),
}));

// Mock logger
vi.mock("../lib/logger", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { authMiddleware } from "../lib/auth";
import sentinelRouter from "../routes/sentinel";

function buildApp() {
  const app = express();
  app.use(express.json());

  // Mount sentinel BEFORE global auth — mirrors server.ts line 125
  app.use("/api/sentinel", sentinelRouter);

  // Global auth with skip list — mirrors the fix in server.ts
  const SELF_AUTH_PREFIXES = ["/auth", "/ingest", "/sentinel"];
  app.use("/api", (req, res, next) => {
    if (SELF_AUTH_PREFIXES.some((p) => req.path.startsWith(p))) return next();
    return authMiddleware(req, res, next);
  });

  // A catch-all protected route to prove auth works for non-sentinel paths
  app.get("/api/protected", (_req, res) => {
    res.json({ ok: true });
  });

  return app;
}

function validToken(): string {
  return jwt.sign(
    { userId: "u1", email: "test@test.com", role: "admin" },
    TEST_JWT_SECRET,
    { expiresIn: "1h" },
  );
}

describe("Sentinel route auth", () => {
  const app = buildApp();

  describe("GET /api/sentinel/current (public, no auth)", () => {
    it("returns 200 without any auth headers", async () => {
      const res = await request(app).get("/api/sentinel/current");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.action).toBe("current");
    });

    it("returns 200 with JWT (auth is ignored, not rejected)", async () => {
      const res = await request(app)
        .get("/api/sentinel/current")
        .set("Authorization", `Bearer ${validToken()}`);
      expect(res.status).toBe(200);
    });
  });

  describe("GET /api/sentinel/history (JWT required)", () => {
    it("returns 401 without token", async () => {
      const res = await request(app).get("/api/sentinel/history");
      expect(res.status).toBe(401);
    });

    it("returns 401 with invalid token", async () => {
      const res = await request(app)
        .get("/api/sentinel/history")
        .set("Authorization", "Bearer invalid-token");
      expect(res.status).toBe(401);
    });

    it("returns 200 with valid JWT", async () => {
      const res = await request(app)
        .get("/api/sentinel/history")
        .set("Authorization", `Bearer ${validToken()}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.action).toBe("history");
    });
  });

  describe("POST /api/sentinel/run (x-gda-key required)", () => {
    it("returns 401 without x-gda-key", async () => {
      const res = await request(app).post("/api/sentinel/run");
      expect(res.status).toBe(401);
    });

    it("returns 401 with wrong key", async () => {
      const res = await request(app)
        .post("/api/sentinel/run")
        .set("x-gda-key", "wrong-key");
      expect(res.status).toBe(401);
    });

    it("returns 200 with correct x-gda-key", async () => {
      const res = await request(app)
        .post("/api/sentinel/run")
        .set("x-gda-key", TEST_WEBHOOK_KEY);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.action).toBe("run");
    });

    it("returns 401 with JWT instead of x-gda-key", async () => {
      const res = await request(app)
        .post("/api/sentinel/run")
        .set("Authorization", `Bearer ${validToken()}`);
      expect(res.status).toBe(401);
    });
  });

  describe("global auth still protects non-sentinel routes", () => {
    it("returns 401 for /api/protected without token", async () => {
      const res = await request(app).get("/api/protected");
      expect(res.status).toBe(401);
    });

    it("returns 200 for /api/protected with valid JWT", async () => {
      const res = await request(app)
        .get("/api/protected")
        .set("Authorization", `Bearer ${validToken()}`);
      expect(res.status).toBe(200);
    });
  });
});
