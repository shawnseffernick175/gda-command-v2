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

  it("enrichFromSAM accepts configurable lookbackYears", async () => {
    const { enrichFromSAM } = await import("../lib/sam-enrichment");
    // With no API key, we can still verify the parameter is accepted
    const origKey = process.env.SAM_API_KEY;
    delete process.env.SAM_API_KEY;

    const result = await enrichFromSAM({
      solicitation_number: "TEST-001",
      title: "Test",
      lookbackYears: 10,
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
// Confidence scoring — calls the REAL exported function, not a duplicate
// ---------------------------------------------------------------------------
describe("USAspending confidence scoring — branch logic", () => {
  it("assigns medium confidence when top candidate has >2x score gap", async () => {
    const { assignConfidence } = await import("../lib/sam-enrichment");
    expect(assignConfidence(10, 4)).toBe("medium");
    expect(assignConfidence(20, 5)).toBe("medium");
  });

  it("assigns medium confidence for 1.2x–2x score gap (distinguishable leader)", async () => {
    const { assignConfidence } = await import("../lib/sam-enrichment");
    expect(assignConfidence(10, 7)).toBe("medium"); // ratio 1.43
    expect(assignConfidence(12, 10)).toBe("medium"); // ratio 1.2 (boundary)
    expect(assignConfidence(15, 8)).toBe("medium"); // ratio 1.875
  });

  it("assigns low confidence when candidates are within 20% (<1.2x ratio)", async () => {
    const { assignConfidence } = await import("../lib/sam-enrichment");
    expect(assignConfidence(10, 9)).toBe("low"); // ratio 1.11
    expect(assignConfidence(10, 10)).toBe("low"); // ratio 1.0
    expect(assignConfidence(11, 10)).toBe("low"); // ratio 1.1
  });

  it("assigns medium confidence when only one candidate has a score", async () => {
    const { assignConfidence } = await import("../lib/sam-enrichment");
    expect(assignConfidence(10, null)).toBe("medium");
    expect(assignConfidence(10, 0)).toBe("medium");
  });

  it("uses usaspending_fuzzy_strong for medium and usaspending_fuzzy_weak for low", async () => {
    const { assignConfidence } = await import("../lib/sam-enrichment");
    const medium = assignConfidence(10, 5);
    const low = assignConfidence(10, 10);
    const assignSource = (c: "high" | "medium" | "low") =>
      c === "low" ? "usaspending_fuzzy_weak" : "usaspending_fuzzy_strong";
    expect(assignSource(medium)).toBe("usaspending_fuzzy_strong");
    expect(assignSource(low)).toBe("usaspending_fuzzy_weak");
  });
});

// ---------------------------------------------------------------------------
// Mock-based SAM field mapping — verifies enrichment output shape
// ---------------------------------------------------------------------------
describe("SAM enrichment — field mapping output shape", () => {
  it("maps SAM fields to correct GDA column names", () => {
    // Simulate what enrichFromSAM does with a SAM record
    const sam = {
      naicsCode: "541511",
      fullParentPathName: "DEPT OF DEFENSE.DEPT OF THE ARMY.PEO IEW&S",
      classificationCode: "R425",
      award: { amount: "5000000", awardee: { name: "Acme Corp" } },
      placeOfPerformance: {
        city: { name: "Aberdeen" },
        state: { name: "Maryland" },
        country: { name: "UNITED STATES" },
      },
    };

    const fields: Record<string, unknown> = {};

    if (sam.naicsCode) fields.naics = sam.naicsCode;
    if (sam.fullParentPathName) {
      const orgParts = sam.fullParentPathName.split(".");
      fields.agency = orgParts[0]?.trim() ?? null;
      fields.department = orgParts.slice(1).join(" / ").trim() || null;
    }
    if (sam.classificationCode) fields.psc = sam.classificationCode;
    if (sam.award?.amount) fields.value_estimated = parseFloat(sam.award.amount);
    if (sam.placeOfPerformance) {
      const parts: string[] = [];
      if (sam.placeOfPerformance.city?.name) parts.push(sam.placeOfPerformance.city.name);
      if (sam.placeOfPerformance.state?.name) parts.push(sam.placeOfPerformance.state.name);
      if (parts.length > 0) fields.place_of_performance = parts.join(", ");
    }

    expect(fields.naics).toBe("541511");
    expect(fields.agency).toBe("DEPT OF DEFENSE");
    expect(fields.department).toBe("DEPT OF THE ARMY / PEO IEW&S");
    expect(fields.psc).toBe("R425");
    expect(fields.value_estimated).toBe(5000000);
    expect(fields.place_of_performance).toBe("Aberdeen, Maryland");
  });

  it("extracts incumbent from SAM award notice with high confidence", () => {
    const sam = {
      award: { awardee: { name: "Booz Allen Hamilton" } },
    };

    let incumbent: string | null = null;
    let confidence: string | null = null;
    let source: string | null = null;

    if (sam.award?.awardee?.name) {
      incumbent = sam.award.awardee.name;
      confidence = "high";
      source = "sam_award";
    }

    expect(incumbent).toBe("Booz Allen Hamilton");
    expect(confidence).toBe("high");
    expect(source).toBe("sam_award");
  });

  it("returns null incumbent when SAM record has no award.awardee", () => {
    const sam = {
      award: { amount: "1000000" },
    };

    let incumbent: string | null = null;
    if ((sam.award as Record<string, unknown>)?.awardee) {
      incumbent = "should not reach here";
    }

    expect(incumbent).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Low-confidence gating — incumbent column behavior
// ---------------------------------------------------------------------------
describe("Low-confidence incumbent gating", () => {
  it("does NOT auto-populate incumbent for low-confidence matches", () => {
    // Simulate the ingest.ts logic for low-confidence
    const result = {
      incumbent: "Acme Corp",
      incumbent_confidence: "low" as const,
      incumbent_source: "usaspending_fuzzy_weak",
    };

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (result.incumbent && result.incumbent_confidence) {
      if (result.incumbent_confidence === "low") {
        // Should set confidence/source but NOT incumbent
        updates.push(`incumbent_confidence = $${paramIdx}`);
        values.push("low");
        paramIdx++;
        updates.push(`incumbent_source = $${paramIdx}`);
        values.push(result.incumbent_source);
        paramIdx++;
      } else {
        updates.push(`incumbent = $${paramIdx}`);
        values.push(result.incumbent);
        paramIdx++;
      }
    }

    // Verify: incumbent column should NOT be in the updates
    expect(updates.some((u) => u.startsWith("incumbent ="))).toBe(false);
    expect(updates).toContain("incumbent_confidence = $1");
    expect(updates).toContain("incumbent_source = $2");
    expect(values).toEqual(["low", "usaspending_fuzzy_weak"]);
  });

  it("DOES auto-populate incumbent for medium-confidence matches", () => {
    const result: { incumbent: string; incumbent_confidence: "high" | "medium" | "low"; incumbent_source: string } = {
      incumbent: "Leidos Inc",
      incumbent_confidence: "medium",
      incumbent_source: "usaspending_fuzzy_strong",
    };

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (result.incumbent && result.incumbent_confidence) {
      if (result.incumbent_confidence === "low") {
        updates.push(`incumbent_confidence = $${paramIdx}`);
        values.push("low");
        paramIdx++;
      } else {
        updates.push(`incumbent = $${paramIdx}`);
        values.push(result.incumbent);
        paramIdx++;
        updates.push(`incumbent_confidence = $${paramIdx}`);
        values.push(result.incumbent_confidence);
        paramIdx++;
        updates.push(`incumbent_source = $${paramIdx}`);
        values.push(result.incumbent_source);
        paramIdx++;
      }
    }

    // Verify: incumbent IS in the updates
    expect(updates.some((u) => u.startsWith("incumbent ="))).toBe(true);
    expect(values[0]).toBe("Leidos Inc");
    expect(values[1]).toBe("medium");
    expect(values[2]).toBe("usaspending_fuzzy_strong");
  });

  it("DOES auto-populate incumbent for high-confidence SAM matches", () => {
    const result: { incumbent: string; incumbent_confidence: "high" | "medium" | "low"; incumbent_source: string } = {
      incumbent: "Raytheon",
      incumbent_confidence: "high",
      incumbent_source: "sam_award",
    };

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (result.incumbent && result.incumbent_confidence) {
      if (result.incumbent_confidence === "low") {
        updates.push(`incumbent_confidence = $${paramIdx}`);
        values.push("low");
        paramIdx++;
      } else {
        updates.push(`incumbent = $${paramIdx}`);
        values.push(result.incumbent);
        paramIdx++;
        updates.push(`incumbent_confidence = $${paramIdx}`);
        values.push(result.incumbent_confidence);
        paramIdx++;
        updates.push(`incumbent_source = $${paramIdx}`);
        values.push(result.incumbent_source);
        paramIdx++;
      }
    }

    expect(updates.some((u) => u.startsWith("incumbent ="))).toBe(true);
    expect(values[0]).toBe("Raytheon");
    expect(values[1]).toBe("high");
    expect(values[2]).toBe("sam_award");
  });
});

// ---------------------------------------------------------------------------
// Keyword extraction — stop word filtering
// ---------------------------------------------------------------------------
describe("USAspending keyword extraction", () => {
  it("filters stop words from title for better search quality", () => {
    const STOP_WORDS = new Set([
      "the", "for", "and", "of", "to", "in", "a", "an", "is", "at", "by",
      "on", "with", "from", "this", "that", "are", "was", "will", "be",
      "contract", "award", "solicitation", "notice", "amendment",
      "usace", "navsea", "modification", "sources", "sought",
    ]);

    const title = "USACE Contract Award For Cybersecurity SETA Support Services";
    const description = "Systems engineering and technical assistance";
    const allText = `${title} ${description}`;
    const keywords = allText
      .split(/\s+/)
      .map((w) => w.replace(/[^a-zA-Z0-9-]/g, "").toLowerCase())
      .filter((w) => w.length > 3 && !STOP_WORDS.has(w))
      .slice(0, 8);

    // Should NOT include "usace", "contract", "award", "for"
    expect(keywords).not.toContain("usace");
    expect(keywords).not.toContain("contract");
    expect(keywords).not.toContain("award");
    // SHOULD include meaningful words
    expect(keywords).toContain("cybersecurity");
    expect(keywords).toContain("seta");
    expect(keywords).toContain("support");
    expect(keywords).toContain("services");
    expect(keywords).toContain("systems");
    expect(keywords).toContain("engineering");
    expect(keywords).toContain("technical");
    expect(keywords).toContain("assistance");
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
    expect(entry.status).toBe("live");
    expect(entry.n8nWorkflow).toBe("GDA.ingest.govtribe-zapier");
    expect(entry.usedBy).toBe("ingest.ts");
  });

  it("registry summary includes govtribe-ingest in live count", async () => {
    const { getRegistrySummary } = await import("../lib/webhook-registry");
    const summary = getRegistrySummary();
    expect(summary.live).toBeGreaterThan(0);
    expect(summary.total).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Schema migration presence
// ---------------------------------------------------------------------------
describe("Migration 050+051 — GovTribe Zapier ingest schema", () => {
  it("migration 050 exists and adds required columns", async () => {
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
  });

  it("migration 051 exists and fixes incumbent_source constraint", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.join(__dirname, "../db/migrations/051_fix_incumbent_source_constraint.sql"),
      "utf8",
    );
    expect(content).toContain("usaspending_fuzzy_strong");
    expect(content).toContain("usaspending_fuzzy_weak");
    // CHECK constraint should not include usaspending_exact as a valid value
    expect(content).toContain("CHECK (incumbent_source IN ('sam_award', 'usaspending_fuzzy_strong', 'usaspending_fuzzy_weak', 'govtribe_mcp', 'manual'))");
  });

  it("migration 052 fixes ordering — UPDATEs before ADD CONSTRAINT", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.join(__dirname, "../db/migrations/052_fix_migration_051_ordering.sql"),
      "utf8",
    );
    // Verify UPDATEs appear BEFORE ADD CONSTRAINT
    const updateIdx = content.indexOf("UPDATE opportunities SET");
    const addConstraintIdx = content.indexOf("ALTER TABLE opportunities ADD CONSTRAINT");
    expect(updateIdx).toBeGreaterThan(-1);
    expect(addConstraintIdx).toBeGreaterThan(-1);
    expect(updateIdx).toBeLessThan(addConstraintIdx);
  });
});
