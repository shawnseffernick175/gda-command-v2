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

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { installCrashHandlers } from "../lib/crash-handlers";

describe("crash handler registration (F-002)", () => {
  let rejectionCountBefore: number;
  let exceptionCountBefore: number;

  beforeAll(() => {
    rejectionCountBefore = process.listenerCount("unhandledRejection");
    exceptionCountBefore = process.listenerCount("uncaughtException");
    installCrashHandlers();
  });

  it("registers an unhandledRejection listener", () => {
    expect(process.listenerCount("unhandledRejection")).toBeGreaterThan(rejectionCountBefore);
  });

  it("registers an uncaughtException listener", () => {
    expect(process.listenerCount("uncaughtException")).toBeGreaterThan(exceptionCountBefore);
  });

  it("is idempotent — calling twice does not double-register", () => {
    const before = process.listenerCount("unhandledRejection");
    installCrashHandlers();
    expect(process.listenerCount("unhandledRejection")).toBe(before);
  });
});
