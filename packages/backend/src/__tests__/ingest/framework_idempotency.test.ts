import { describe, it, expect, vi, beforeEach } from "vitest";
import type { IngestResult } from "../../ingest/framework/registry";

// Mock the database
vi.mock("../../lib/db", () => ({
  getPool: vi.fn(),
}));

vi.mock("../../lib/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { getPool } from "../../lib/db";

const mockQuery = vi.fn();
const mockConnect = vi.fn();
const mockRelease = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mockQuery.mockReset();
  mockConnect.mockReset();
  mockRelease.mockReset();

  const mockClient = {
    query: mockQuery,
    release: mockRelease,
  };
  mockConnect.mockResolvedValue(mockClient);

  (getPool as ReturnType<typeof vi.fn>).mockReturnValue({
    query: mockQuery,
    connect: mockConnect,
  });
});

describe("Ingest framework — idempotency", () => {
  it("startRun creates a running ingest_runs row", async () => {
    const { startRun } = await import("../../ingest/framework/run_logger");

    mockQuery.mockResolvedValueOnce({ rows: [{ id: "42" }] });

    const runId = await startRun("sam.gov");
    expect(runId).toBe(42n);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO ingest_runs"),
      ["sam.gov"],
    );
  });

  it("finishRun updates the row with success counters", async () => {
    const { finishRun } = await import("../../ingest/framework/run_logger");

    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result: IngestResult = { inserted: 5, updated: 3, skipped: 1 };
    await finishRun(42n, "success", result);

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE ingest_runs"),
      [5, 3, 1, "success", null, "42"],
    );
  });

  it("finishRun records error text on failure", async () => {
    const { finishRun } = await import("../../ingest/framework/run_logger");

    mockQuery.mockResolvedValueOnce({ rows: [] });

    await finishRun(99n, "error", { inserted: 0, updated: 0, skipped: 0 }, "API timeout");

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE ingest_runs"),
      [0, 0, 0, "error", "API timeout", "99"],
    );
  });

  it("source_writer upserts opportunity and writes citations in a transaction", async () => {
    const { upsertOpportunityWithSources } = await import("../../ingest/framework/source_writer");

    // BEGIN
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // INSERT source
    mockQuery.mockResolvedValueOnce({ rows: [{ id: "10" }] });
    // INSERT opportunity (newly inserted)
    mockQuery.mockResolvedValueOnce({ rows: [{ id: "100", was_inserted: true }] });
    // INSERT citation (title)
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // INSERT citation (agency)
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // COMMIT
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await upsertOpportunityWithSources(
      {
        sam_notice_id: "test-001",
        title: "Test Opp",
        agency: "DOD",
        sub_agency: null,
        department: null,
        solicitation_number: null,
        status: "discovery",
        value_min: null,
        value_max: null,
        naics: null,
        psc: null,
        set_aside: null,
        place_of_performance: null,
        response_due_at: null,
        posted_at: null,
        description: null,
        data_source: "sam.gov",
        tags: [],
      },
      [
        { field: "title", source_url: "https://sam.gov/opp/test-001/view" },
        { field: "agency", source_url: "https://sam.gov/opp/test-001/view" },
      ],
      "sam_gov",
    );

    expect(result).toBe("inserted");

    // Verify transaction structure: BEGIN, source, opp, citations, COMMIT
    expect(mockQuery.mock.calls[0][0]).toBe("BEGIN");
    expect(mockQuery.mock.calls[1][0]).toContain("INSERT INTO sources");
    expect(mockQuery.mock.calls[2][0]).toContain("INSERT INTO opportunities");
    expect(mockQuery.mock.calls[3][0]).toContain("opportunity_title_sources");
    expect(mockQuery.mock.calls[4][0]).toContain("opportunity_agency_sources");
    expect(mockQuery.mock.calls[5][0]).toBe("COMMIT");
  });

  it("source_writer returns 'updated' when opportunity already exists", async () => {
    const { upsertOpportunityWithSources } = await import("../../ingest/framework/source_writer");

    mockQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
    mockQuery.mockResolvedValueOnce({ rows: [{ id: "11" }] }); // source
    mockQuery.mockResolvedValueOnce({ rows: [{ id: "100", was_inserted: false }] }); // opp (updated)
    mockQuery.mockResolvedValueOnce({ rows: [] }); // citation
    mockQuery.mockResolvedValueOnce({ rows: [] }); // COMMIT

    const result = await upsertOpportunityWithSources(
      {
        sam_notice_id: "existing-001",
        title: "Existing Opp",
        agency: null,
        sub_agency: null,
        department: null,
        solicitation_number: null,
        status: "discovery",
        value_min: null,
        value_max: null,
        naics: null,
        psc: null,
        set_aside: null,
        place_of_performance: null,
        response_due_at: null,
        posted_at: null,
        description: null,
        data_source: "sam.gov",
        tags: [],
      },
      [{ field: "title", source_url: "https://sam.gov/opp/existing-001/view" }],
      "sam_gov",
    );

    expect(result).toBe("updated");
  });

  it("source_writer rolls back on error", async () => {
    const { upsertOpportunityWithSources } = await import("../../ingest/framework/source_writer");

    mockQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
    mockQuery.mockResolvedValueOnce({ rows: [{ id: "12" }] }); // source
    mockQuery.mockRejectedValueOnce(new Error("constraint violation")); // opp fails
    mockQuery.mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    await expect(
      upsertOpportunityWithSources(
        {
          sam_notice_id: "fail-001",
          title: "Failing Opp",
          agency: null,
          sub_agency: null,
          department: null,
          solicitation_number: null,
          status: "discovery",
          value_min: null,
          value_max: null,
          naics: null,
          psc: null,
          set_aside: null,
          place_of_performance: null,
          response_due_at: null,
          posted_at: null,
          description: null,
          data_source: "sam.gov",
          tags: [],
        },
        [{ field: "title", source_url: "https://sam.gov/opp/fail-001/view" }],
        "sam_gov",
      ),
    ).rejects.toThrow("constraint violation");

    expect(mockQuery.mock.calls[3][0]).toBe("ROLLBACK");
  });

  it("registry rejects unknown source keys", async () => {
    const { runIngest } = await import("../../ingest/framework/registry");

    await expect(runIngest("nonexistent")).rejects.toThrow("Unknown ingest source: nonexistent");
  });

  it("registry registers and lists sources", async () => {
    // Clear module cache to get fresh registry
    vi.resetModules();
    const { registerSource, getRegisteredSources } = await import("../../ingest/framework/registry");

    registerSource("test.source", "Test Source", async () => ({ inserted: 1, updated: 0, skipped: 0 }));

    expect(getRegisteredSources()).toContain("test.source");
  });
});
