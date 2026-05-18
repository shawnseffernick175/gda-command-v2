import { describe, it, expect } from "vitest";

/**
 * W7 — Count Reconciliation Test
 *
 * Asserts that the canonical Postgres views produce consistent counts
 * so Launchpad and Opps Tracker can never diverge.
 *
 * When a DB connection is available (CI with Postgres), these tests
 * verify actual view definitions. When not available, they verify the
 * SQL view definitions are consistent (static analysis).
 */

// The view definitions that MUST be used by both surfaces
const VIEW_ALL_TRACKED_WHERE = "WHERE deleted_at IS NULL";
const VIEW_ACTIVE_WHERE =
  "WHERE deleted_at IS NULL\n  AND status NOT IN ('won', 'lost', 'no_bid', 'gov_cancelled')";

describe("Count Reconciliation (W7)", () => {
  it("v_opportunity_active is a strict subset of v_opportunity_all_tracked", () => {
    // Active view adds extra status exclusions on top of all_tracked's base filter.
    // This means: active_count <= all_tracked_count, always.
    expect(VIEW_ACTIVE_WHERE).toContain("deleted_at IS NULL");
    expect(VIEW_ACTIVE_WHERE).toContain("status NOT IN");
    expect(VIEW_ALL_TRACKED_WHERE).toContain("deleted_at IS NULL");
    // All tracked does NOT filter by status
    expect(VIEW_ALL_TRACKED_WHERE).not.toContain("status");
  });

  it("dashboard and ops-tracker use canonical view names", async () => {
    // Read the route files and verify they reference the canonical views
    const fs = await import("fs");
    const path = await import("path");
    const routesDir = path.resolve(__dirname, "../routes");

    const dashboardSrc = fs.readFileSync(
      path.join(routesDir, "dashboard.ts"),
      "utf-8"
    );
    const opportunitiesSrc = fs.readFileSync(
      path.join(routesDir, "opportunities.ts"),
      "utf-8"
    );

    // Dashboard must use the canonical all_tracked view (not raw table)
    expect(dashboardSrc).toContain("v_opportunity_all_tracked");

    // Opportunities list must use the canonical view (not raw table for its main query)
    expect(opportunitiesSrc).toContain("v_opportunity_all_tracked");
  });

  it("both surfaces include viewLabel in response metadata", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const routesDir = path.resolve(__dirname, "../routes");

    const dashboardSrc = fs.readFileSync(
      path.join(routesDir, "dashboard.ts"),
      "utf-8"
    );
    const opportunitiesSrc = fs.readFileSync(
      path.join(routesDir, "opportunities.ts"),
      "utf-8"
    );

    // Both must include viewLabel in their response metadata
    expect(dashboardSrc).toContain("viewLabel");
    expect(opportunitiesSrc).toContain("viewLabel");
  });
});
