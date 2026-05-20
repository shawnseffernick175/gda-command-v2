/**
 * Tests for enrichment concurrency limiter.
 *
 * Verifies:
 * - At most N tasks run concurrently
 * - All tasks eventually complete
 * - Errors in one task don't break the queue
 */

import { describe, it, expect } from "vitest";
import { createConcurrencyLimiter, ENRICHMENT_CONCURRENCY } from "../lib/concurrency";

describe("createConcurrencyLimiter", () => {
  it("exports a default concurrency of 5", () => {
    expect(ENRICHMENT_CONCURRENCY).toBe(5);
  });

  it("limits concurrent execution to the specified concurrency", async () => {
    const limit = createConcurrencyLimiter(3);
    let activeConcurrent = 0;
    let maxConcurrent = 0;

    const tasks = Array.from({ length: 20 }, (_, i) =>
      limit(async () => {
        activeConcurrent++;
        maxConcurrent = Math.max(maxConcurrent, activeConcurrent);
        // Simulate async work
        await new Promise((r) => setTimeout(r, 10));
        activeConcurrent--;
        return i;
      })
    );

    const results = await Promise.all(tasks);
    expect(maxConcurrent).toBeLessThanOrEqual(3);
    expect(results).toEqual(Array.from({ length: 20 }, (_, i) => i));
  });

  it("resolves all tasks even when concurrency is 1", async () => {
    const limit = createConcurrencyLimiter(1);
    const results: number[] = [];

    await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        limit(async () => {
          results.push(i);
        })
      )
    );

    expect(results).toHaveLength(5);
  });

  it("propagates errors without breaking the queue", async () => {
    const limit = createConcurrencyLimiter(2);
    const results: string[] = [];

    const tasks = [
      limit(async () => { results.push("a"); return "a"; }),
      limit(async () => { throw new Error("fail"); }),
      limit(async () => { results.push("c"); return "c"; }),
      limit(async () => { results.push("d"); return "d"; }),
    ];

    const settled = await Promise.allSettled(tasks);
    expect(settled[0]).toMatchObject({ status: "fulfilled", value: "a" });
    expect(settled[1]).toMatchObject({ status: "rejected" });
    expect(settled[2]).toMatchObject({ status: "fulfilled", value: "c" });
    expect(settled[3]).toMatchObject({ status: "fulfilled", value: "d" });
    expect(results).toEqual(["a", "c", "d"]);
  });

  it("is wired into all 3 ingest enrichment pipelines", () => {
    // Structural check: ingest.ts imports and uses the limiter
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const ingest = readFileSync(join(__dirname, "../routes/ingest.ts"), "utf8");

    expect(ingest).toContain('import { createConcurrencyLimiter, ENRICHMENT_CONCURRENCY } from "../lib/concurrency"');

    // Count limitEnrichment instantiations (one per handler)
    const limiterCreations = (ingest.match(/createConcurrencyLimiter\(ENRICHMENT_CONCURRENCY\)/g) ?? []).length;
    expect(limiterCreations).toBe(3);

    // Count limitEnrichment wrappings
    const limiterUsages = (ingest.match(/limitEnrichment\(\(\) => enrichOpportunity\(/g) ?? []).length;
    expect(limiterUsages).toBe(3);
  });
});
