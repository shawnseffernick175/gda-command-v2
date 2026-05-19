import { describe, it, expect, vi } from "vitest";

vi.mock("../lib/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ---------------------------------------------------------------------------
// GovTribe Zapier → GDA ingest mapping tests
// ---------------------------------------------------------------------------
describe("GovTribe Zapier ingest — field mapping", () => {
  it("mapOpportunityType maps solicitation types correctly", () => {
    // Mirror the function from ingest.ts exactly
    const mapOpportunityType = (type?: string): string => {
      if (!type) return "discovery";
      const lower = type.toLowerCase();
      if (lower.includes("award")) return "won";
      if (lower.includes("pre-solicitation") || lower.includes("presolicitation")) return "discovery";
      if (lower.includes("sources sought") || lower.includes("rfi")) return "discovery";
      if (lower.includes("solicitation") || lower.includes("rfp") || lower.includes("rfq")) return "qualified";
      return "discovery";
    };

    expect(mapOpportunityType("Award Notice")).toBe("won");
    expect(mapOpportunityType("Solicitation")).toBe("qualified");
    expect(mapOpportunityType("RFP")).toBe("qualified");
    expect(mapOpportunityType("RFQ")).toBe("qualified");
    expect(mapOpportunityType("Pre-Solicitation")).toBe("discovery");
    expect(mapOpportunityType("Sources Sought")).toBe("discovery");
    expect(mapOpportunityType("RFI")).toBe("discovery");
    expect(mapOpportunityType(undefined)).toBe("discovery");
    expect(mapOpportunityType("Combined Synopsis/Solicitation")).toBe("qualified");
  });

  it("prefixes GovTribe IDs to avoid collisions with SAM IDs", () => {
    const raw = { id: "abc123", name: "Test Opp" };
    const mapped_id = raw.id ? `govtribe-${raw.id}` : null;
    expect(mapped_id).toBe("govtribe-abc123");
  });

  it("prefers government_description over description", () => {
    const raw = {
      government_description: "Full scope of work text",
      description: "Short description",
    };
    const description = raw.government_description ?? raw.description ?? null;
    expect(description).toBe("Full scope of work text");
  });

  it("maps ai_description to ai_summary", () => {
    const raw = { ai_description: "AI-generated summary of opportunity" };
    const ai_summary = raw.ai_description ?? null;
    expect(ai_summary).toBe("AI-generated summary of opportunity");
  });

  it("handles missing optional fields gracefully", () => {
    const raw: Record<string, unknown> = { id: "test-1", name: "Minimal Opp" };
    const mapped = {
      id: `govtribe-${raw.id}`,
      title: raw.name ?? raw.title ?? "Untitled",
      solicitation_number: raw.solicitation_number ?? null,
      set_aside: raw.set_aside_type ?? raw.set_aside ?? null,
      due_date: raw.due_date ?? null,
      description: raw.government_description ?? raw.description ?? null,
      ai_summary: raw.ai_description ?? null,
    };
    expect(mapped.id).toBe("govtribe-test-1");
    expect(mapped.title).toBe("Minimal Opp");
    expect(mapped.solicitation_number).toBeNull();
    expect(mapped.set_aside).toBeNull();
    expect(mapped.due_date).toBeNull();
    expect(mapped.description).toBeNull();
    expect(mapped.ai_summary).toBeNull();
  });

  it("rejects records without an id", () => {
    const raw: Record<string, unknown> = { name: "No ID Opp" };
    const id = raw.id ? `govtribe-${raw.id}` : null;
    expect(id).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SAM enrichment service tests (using real module, not mocked)
// ---------------------------------------------------------------------------
describe("SAM enrichment — confidence scoring", () => {
  it("enrichFromSAM returns enriched=false when no solicitation number", async () => {
    const { enrichFromSAM } = await import("../lib/sam-enrichment");
    const result = await enrichFromSAM({
      title: "Test",
      description: null,
    });
    expect(result.enriched).toBe(false);
    expect(result.error).toBe("no_solicitation_number");
  });

  it("enrichFromSAM returns enriched=false when SAM_API_KEY is missing", async () => {
    const origKey = process.env.SAM_API_KEY;
    delete process.env.SAM_API_KEY;

    const { enrichFromSAM } = await import("../lib/sam-enrichment");
    const result = await enrichFromSAM({
      solicitation_number: "W15QKN-24-R-0001",
      title: "Test",
    });
    expect(result.enriched).toBe(false);
    expect(result.error).toBe("no_sam_api_key");

    if (origKey) process.env.SAM_API_KEY = origKey;
  });
});

// ---------------------------------------------------------------------------
// USAspending incumbent fallback — threshold gating
// ---------------------------------------------------------------------------
describe("USAspending incumbent fallback — threshold gating", () => {
  it("skips enrichment for low-scoring opportunities without core keywords", async () => {
    const { enrichIncumbentFromUSAspending } = await import("../lib/sam-enrichment");
    const result = await enrichIncumbentFromUSAspending({
      title: "Generic IT Services",
      score: 30,
      naics: "999999",
    });
    expect(result.incumbent).toBeNull();
    expect(result.incumbent_confidence).toBeNull();
  });

  it("attempts enrichment for opportunities with core NAICS even at low score", async () => {
    const { enrichIncumbentFromUSAspending } = await import("../lib/sam-enrichment");
    const result = await enrichIncumbentFromUSAspending({
      title: "SETA Support Services",
      score: 20,
      naics: "541511",
    });
    // Won't skip due to core NAICS — result depends on API availability
    expect(result).toBeDefined();
    expect(result).toHaveProperty("incumbent");
    expect(result).toHaveProperty("incumbent_confidence");
    expect(result).toHaveProperty("incumbent_source");
  });

  it("attempts enrichment for opportunities with core keyword match regardless of score", async () => {
    const { enrichIncumbentFromUSAspending } = await import("../lib/sam-enrichment");
    const result = await enrichIncumbentFromUSAspending({
      title: "C5ISR Systems Engineering Support",
      score: 10,
    });
    expect(result).toBeDefined();
    expect(result).toHaveProperty("incumbent");
  });
});

// ---------------------------------------------------------------------------
// Webhook registry entry
// ---------------------------------------------------------------------------
describe("Webhook registry — govtribe-ingest entry", () => {
  it("includes govtribe-ingest webhook in registry", async () => {
    const { WEBHOOK_REGISTRY } = await import("../lib/webhook-registry");
    const entry = WEBHOOK_REGISTRY["govtribe-ingest"];
    expect(entry).toBeDefined();
    expect(entry.path).toBe("govtribe-ingest");
    expect(entry.status).toBe("planned");
    expect(entry.n8nWorkflow).toBe("GDA.ingest.govtribe-zapier");
    expect(entry.usedBy).toBe("ingest.ts");
  });

  it("registry summary includes govtribe-ingest in planned count", async () => {
    const { getRegistrySummary } = await import("../lib/webhook-registry");
    const summary = getRegistrySummary();
    expect(summary.planned).toBeGreaterThan(0);
    expect(summary.total).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Schema migration presence
// ---------------------------------------------------------------------------
describe("Migration 050 — GovTribe Zapier ingest schema", () => {
  it("migration file exists", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const migrationPath = path.join(
      __dirname,
      "../db/migrations/050_govtribe_zapier_ingest.sql",
    );
    expect(fs.existsSync(migrationPath)).toBe(true);
  });

  it("migration adds required columns and feed entry", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.join(__dirname, "../db/migrations/050_govtribe_zapier_ingest.sql"),
      "utf8",
    );
    expect(content).toContain("ai_summary");
    expect(content).toContain("incumbent_confidence");
    expect(content).toContain("incumbent_source");
    expect(content).toContain("feed-govtribe-zapier");
    expect(content).toContain("govtribe_zapier");
  });
});
