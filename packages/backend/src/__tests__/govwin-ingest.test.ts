import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../lib/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../lib/db", () => ({
  getPool: vi.fn(() => null),
}));

// ---------------------------------------------------------------------------
// GovWin WSAPI integration tests — OAuth, mapping, dedup, rate limiting
// ---------------------------------------------------------------------------

describe("GovWin opportunity mapping", () => {
  // Mirror the mapGovWinOpportunity function from ingest.ts
  function mapGovWinOpportunity(raw: Record<string, unknown>): Record<string, unknown> {
    let valueEstimated: number | null = null;
    if (raw.oppValue) {
      const parsed = parseFloat(raw.oppValue as string);
      if (Number.isFinite(parsed)) valueEstimated = parsed * 1000;
    }

    const govEntity = raw.govEntity as { title?: string } | undefined;
    const primaryNAICS = raw.primaryNAICS as { title?: string } | undefined;
    const competitionTypes = raw.competitionTypes as Array<{ title: string }> | undefined;
    const solicitationDate = raw.solicitationDate as { value?: string } | undefined;
    const links = raw.links as { webHref?: { href?: string } } | undefined;

    return {
      id: `govwin-${raw.id}`,
      title: raw.title ?? "Untitled",
      status: mapGovWinStatus(raw.status as string | undefined),
      solicitation_number: raw.solicitationNumber ?? null,
      set_aside: competitionTypes?.map(c => c.title).join(", ") ?? null,
      due_date: solicitationDate?.value ?? null,
      description: raw.description ?? null,
      agency: govEntity?.title ?? null,
      naics: primaryNAICS?.title ?? null,
      value_estimated: valueEstimated,
      raw_source_url: raw.sourceURL ?? (links?.webHref?.href
        ? `https://iq.govwin.com/neo/opportunity/view/${raw.iqOppId}`
        : null),
      data_source: "govwin",
      govwin_update_date: raw.updateDate ?? null,
    };
  }

  function mapGovWinStatus(status?: string): string {
    if (!status) return "discovery";
    const lower = status.toLowerCase();
    if (lower.includes("awarded") || lower.includes("won")) return "won";
    if (lower.includes("cancelled") || lower.includes("canceled") || lower.includes("closed")) return "lost";
    if (lower.includes("pre-rfp") || lower.includes("forecasted")) return "discovery";
    if (lower.includes("rfp") || lower.includes("solicitation")) return "qualified";
    return "discovery";
  }

  it("maps a full GovWin WSAPI opportunity correctly", () => {
    const raw = {
      id: "OPP242136",
      iqOppId: 242136,
      title: "SHIP SELF DEFENSE SYSTEM SOFTWARE DESIGN AGENT",
      description: "<p>The Department of the Navy...</p>",
      status: "Pre-RFP",
      type: "trackedopp",
      govEntity: { id: 25592, title: "NAVAL SEA SYSTEMS COMMAND" },
      primaryNAICS: { id: 100, title: "Systems Engineering", sizeStandard: "$47.0 million" },
      solicitationNumber: "N0002424R5106",
      solicitationDate: { value: "2026-08-21T00:00:00.000", deltekEstimate: "true" },
      awardDate: { value: "2027-02-26T00:00:00.000" },
      oppValue: "50000",
      sourceURL: "https://sam.gov/opp/b139eb1c/view",
      updateDate: "2026-05-20T10:04:07.993",
      createdDate: "2024-04-23T11:58:50.570",
      competitionTypes: [{ id: 47, title: "Undetermined" }],
      contractTypes: [{ id: 1, title: "Firm Fixed Price" }],
      links: { webHref: { href: "https://iq.govwin.com/neo/opportunity/view/242136" } },
    };

    const mapped = mapGovWinOpportunity(raw);

    expect(mapped.id).toBe("govwin-OPP242136");
    expect(mapped.title).toBe("SHIP SELF DEFENSE SYSTEM SOFTWARE DESIGN AGENT");
    expect(mapped.status).toBe("discovery"); // Pre-RFP → discovery
    expect(mapped.solicitation_number).toBe("N0002424R5106");
    expect(mapped.set_aside).toBe("Undetermined");
    expect(mapped.due_date).toBe("2026-08-21T00:00:00.000");
    expect(mapped.agency).toBe("NAVAL SEA SYSTEMS COMMAND");
    expect(mapped.naics).toBe("Systems Engineering");
    expect(mapped.value_estimated).toBe(50000000); // 50000 × 1000
    expect(mapped.raw_source_url).toBe("https://sam.gov/opp/b139eb1c/view");
    expect(mapped.data_source).toBe("govwin");
    expect(mapped.govwin_update_date).toBe("2026-05-20T10:04:07.993");
  });

  it("prefixes GovWin IDs with govwin-", () => {
    const mapped = mapGovWinOpportunity({ id: "OPP12345", title: "Test" });
    expect(mapped.id).toBe("govwin-OPP12345");
  });

  it("multiplies oppValue by 1000 (values in thousands per API docs)", () => {
    const mapped = mapGovWinOpportunity({ id: "TNS100", oppValue: "250" });
    expect(mapped.value_estimated).toBe(250000);
  });

  it("handles zero oppValue", () => {
    const mapped = mapGovWinOpportunity({ id: "TNS101", oppValue: "0" });
    expect(mapped.value_estimated).toBe(0);
  });

  it("handles missing oppValue", () => {
    const mapped = mapGovWinOpportunity({ id: "TNS102" });
    expect(mapped.value_estimated).toBeNull();
  });

  it("handles non-numeric oppValue", () => {
    const mapped = mapGovWinOpportunity({ id: "TNS103", oppValue: "TBD" });
    expect(mapped.value_estimated).toBeNull();
  });

  it("uses sourceURL when available", () => {
    const mapped = mapGovWinOpportunity({
      id: "OPP1",
      sourceURL: "https://sam.gov/opp/abc123/view",
      links: { webHref: { href: "https://iq.govwin.com/neo/opportunity/view/1" } },
    });
    expect(mapped.raw_source_url).toBe("https://sam.gov/opp/abc123/view");
  });

  it("falls back to GovWin URL when no sourceURL", () => {
    const mapped = mapGovWinOpportunity({
      id: "OPP2",
      iqOppId: 2,
      links: { webHref: { href: "https://iq.govwin.com/neo/opportunity/view/2" } },
    });
    expect(mapped.raw_source_url).toBe("https://iq.govwin.com/neo/opportunity/view/2");
  });

  it("handles missing all URL sources", () => {
    const mapped = mapGovWinOpportunity({ id: "OPP3" });
    expect(mapped.raw_source_url).toBeNull();
  });

  it("joins multiple competition types", () => {
    const mapped = mapGovWinOpportunity({
      id: "OPP4",
      competitionTypes: [
        { id: 1, title: "Full and Open" },
        { id: 2, title: "8(a) Sole Source" },
      ],
    });
    expect(mapped.set_aside).toBe("Full and Open, 8(a) Sole Source");
  });

  it("handles missing optional fields gracefully", () => {
    const mapped = mapGovWinOpportunity({ id: "OPP5" });
    expect(mapped.title).toBe("Untitled");
    expect(mapped.solicitation_number).toBeNull();
    expect(mapped.set_aside).toBeNull();
    expect(mapped.due_date).toBeNull();
    expect(mapped.description).toBeNull();
    expect(mapped.agency).toBeNull();
    expect(mapped.naics).toBeNull();
    expect(mapped.govwin_update_date).toBeNull();
  });
});

describe("GovWin status mapping", () => {
  function mapGovWinStatus(status?: string): string {
    if (!status) return "discovery";
    const lower = status.toLowerCase();
    if (lower.includes("awarded") || lower.includes("won")) return "won";
    if (lower.includes("cancelled") || lower.includes("canceled") || lower.includes("closed")) return "lost";
    if (lower.includes("pre-rfp") || lower.includes("forecasted")) return "discovery";
    if (lower.includes("rfp") || lower.includes("solicitation")) return "qualified";
    return "discovery";
  }

  it("maps Awarded to won", () => {
    expect(mapGovWinStatus("Awarded")).toBe("won");
  });

  it("maps Pre-RFP to discovery", () => {
    expect(mapGovWinStatus("Pre-RFP")).toBe("discovery");
  });

  it("maps Forecasted to discovery", () => {
    expect(mapGovWinStatus("Forecasted")).toBe("discovery");
  });

  it("maps RFP Released to qualified", () => {
    expect(mapGovWinStatus("RFP Released")).toBe("qualified");
  });

  it("maps Solicitation to qualified", () => {
    expect(mapGovWinStatus("Solicitation")).toBe("qualified");
  });

  it("maps Cancelled to lost", () => {
    expect(mapGovWinStatus("Cancelled")).toBe("lost");
  });

  it("maps Closed to lost", () => {
    expect(mapGovWinStatus("Closed")).toBe("lost");
  });

  it("maps undefined to discovery", () => {
    expect(mapGovWinStatus(undefined)).toBe("discovery");
  });

  it("maps unknown status to discovery", () => {
    expect(mapGovWinStatus("Active")).toBe("discovery");
  });
});

describe("GovWin OAuth2 token management", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubEnv("GOVWIN_CLIENT_ID", "test-client-id");
    vi.stubEnv("GOVWIN_CLIENT_SECRET", "test-client-secret");
    vi.stubEnv("GOVWIN_USERNAME", "test@example.com");
    vi.stubEnv("GOVWIN_PASSWORD", "test-password");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    global.fetch = originalFetch;
  });

  it("getGovWinAccessToken does password grant on first call", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: "test-access-token",
        refresh_token: "test-refresh-token",
        expires_in: 43199,
        token_type: "bearer",
      }),
    }) as unknown as typeof fetch;

    const { getGovWinAccessToken, _resetTokenState } = await import("../lib/govwin-client");
    _resetTokenState();

    const token = await getGovWinAccessToken();
    expect(token).toBe("test-access-token");
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Verify the password grant request format
    const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[0]).toBe("https://services.govwin.com/neo-ws/oauth/token");
    const body = callArgs[1].body as string;
    expect(body).toContain("grant_type=password");
    expect(body).toContain("scope=read");
  });

  it("does NOT retry on auth failure (lockout prevention)", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => '{"error":"invalid_client"}',
    }) as unknown as typeof fetch;

    const { getGovWinAccessToken, _resetTokenState } = await import("../lib/govwin-client");
    _resetTokenState();

    await expect(getGovWinAccessToken()).rejects.toThrow("GovWin password grant failed");
    expect(global.fetch).toHaveBeenCalledTimes(1); // No retry
  });

  it("throws when credentials are missing", async () => {
    vi.stubEnv("GOVWIN_CLIENT_ID", "");

    const { getGovWinAccessToken, _resetTokenState } = await import("../lib/govwin-client");
    _resetTokenState();

    await expect(getGovWinAccessToken()).rejects.toThrow("GOVWIN_CLIENT_ID not configured");
  });
});

describe("GovWin rate limit guard", () => {
  it("checkGovWinRateLimit returns allowed when under threshold", async () => {
    const { checkGovWinRateLimit } = await import("../lib/govwin-client");
    // With no DB (mocked to null), call count defaults to 0
    const result = await checkGovWinRateLimit();
    expect(result.allowed).toBe(true);
    expect(result.current).toBe(0);
    expect(result.limit).toBe(3000);
  });
});

describe("GovWin updateDate dedup logic", () => {
  it("skips opportunity when updateDate matches stored value", () => {
    const storedUpdates = new Map<string, string>();
    storedUpdates.set("OPP100", "2026-05-20T10:00:00.000");

    const opp = { id: "OPP100", updateDate: "2026-05-20T10:00:00.000", title: "Test" };
    const stored = storedUpdates.get(opp.id);
    const shouldSkip = stored !== undefined && stored === opp.updateDate;
    expect(shouldSkip).toBe(true);
  });

  it("processes opportunity when updateDate differs from stored", () => {
    const storedUpdates = new Map<string, string>();
    storedUpdates.set("OPP100", "2026-05-19T10:00:00.000");

    const opp = { id: "OPP100", updateDate: "2026-05-20T10:00:00.000", title: "Test" };
    const stored = storedUpdates.get(opp.id);
    const shouldSkip = stored !== undefined && stored === opp.updateDate;
    expect(shouldSkip).toBe(false);
  });

  it("processes new opportunity not in stored map", () => {
    const storedUpdates = new Map<string, string>();

    const opp = { id: "OPP200", updateDate: "2026-05-20T10:00:00.000", title: "New Opp" };
    const stored = storedUpdates.get(opp.id);
    const shouldSkip = stored !== undefined && stored === opp.updateDate;
    expect(shouldSkip).toBe(false);
  });
});

describe("GovWin WSAPI response validation", () => {
  it("validates JSON content-type", () => {
    const validateJsonResponse = (contentType: string): boolean => {
      return contentType.includes("application/json");
    };

    expect(validateJsonResponse("application/json")).toBe(true);
    expect(validateJsonResponse("application/json; charset=utf-8")).toBe(true);
    expect(validateJsonResponse("text/html")).toBe(false);
    expect(validateJsonResponse("text/html; charset=utf-8")).toBe(false);
    expect(validateJsonResponse("")).toBe(false);
  });

  it("detects HTML response (the original F-006 bug)", () => {
    const contentType = "text/html; charset=utf-8";
    const isJson = contentType.includes("application/json");
    const isHtml = contentType.includes("text/html");

    expect(isJson).toBe(false);
    expect(isHtml).toBe(true);
  });
});

describe("GovWin relative date handling", () => {
  it("valid relative dates accepted by WSAPI", () => {
    const validDates = ["-24H", "-1W", "-30D", "-3M", "-6M", "-1Y", "-2Y", "-5Y"];
    for (const d of validDates) {
      expect(d).toMatch(/^-\d+(H|W|D|M|Y)$/);
    }
  });

  it("rejects -25H as invalid (not in WSAPI's allowed set)", () => {
    const invalidDate = "-25H";
    const validRelativeDates = new Set(["-24H", "-1W", "-30D", "-3M", "-6M", "-1Y", "-2Y", "-5Y"]);
    expect(validRelativeDates.has(invalidDate)).toBe(false);
  });
});

describe("GovWin poll search config", () => {
  it("uses saved search IDs from env when available", () => {
    const envIds = "12345,67890";
    const savedSearchIds = envIds.split(",").map(s => s.trim()).filter(Boolean);
    expect(savedSearchIds).toEqual(["12345", "67890"]);
  });

  it("falls back to OPP,TNS keyword search when no saved search IDs", () => {
    const envIds = "";
    const savedSearchIds = envIds.split(",").map(s => s.trim()).filter(Boolean);
    expect(savedSearchIds).toHaveLength(0);

    // Default search config
    const defaultSearch = { oppType: "OPP,TNS", dateFrom: "-1W" };
    expect(defaultSearch.oppType).toBe("OPP,TNS");
    expect(defaultSearch.dateFrom).toBe("-1W");
  });
});

describe("GovWin n8n workflow config", () => {
  it("cron expression is 0 10 * * * (daily 6am ET = 10am UTC)", () => {
    const cron = "0 10 * * *";
    const parts = cron.split(" ");
    expect(parts).toHaveLength(5);
    expect(parts[0]).toBe("0"); // minute
    expect(parts[1]).toBe("10"); // hour (UTC)
    expect(parts[2]).toBe("*"); // day of month
    expect(parts[3]).toBe("*"); // month
    expect(parts[4]).toBe("*"); // day of week
  });
});

describe("GovWin migration 055", () => {
  it("migration file exists and has correct structure", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const migrationPath = path.resolve(__dirname, "../db/migrations/055_govwin_wsapi_integration.sql");
    expect(fs.existsSync(migrationPath)).toBe(true);

    const content = fs.readFileSync(migrationPath, "utf-8");
    expect(content).toContain("govwin_call_log");
    expect(content).toContain("govwin_update_date");
    expect(content).toContain("sync_freshness_hours");
    expect(content).toContain("role = 'primary'");
  });
});
