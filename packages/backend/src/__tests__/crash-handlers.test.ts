/**
 * Regression test for F-002: unhandledRejection / uncaughtException handlers.
 *
 * Root cause of silent daily crashes: Node.js 18+ terminates the process on
 * unhandled promise rejections. Without handlers, any async error in background
 * tasks (feed sync, agent scheduler, webhooks) killed the server instantly
 * with no log output.
 *
 * Fixed in PR #213. This test verifies the handlers remain installed.
 */

import { describe, it, expect, beforeAll } from "vitest";

describe("crash handler registration (F-002)", () => {
  beforeAll(async () => {
    // Import app to trigger handler registration (side effect of server.ts)
    await import("../server");
  });

  it("has at least one unhandledRejection listener", () => {
    expect(process.listenerCount("unhandledRejection")).toBeGreaterThan(0);
  });

  it("has at least one uncaughtException listener", () => {
    expect(process.listenerCount("uncaughtException")).toBeGreaterThan(0);
  });
});
