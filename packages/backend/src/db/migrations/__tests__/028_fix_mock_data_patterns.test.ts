/**
 * Paired test for migration 028: fix mock data removal patterns.
 *
 * State dependency: Migration 027 used incorrect ID patterns (e.g.,
 * 'briefing-%' instead of 'brief-%'). Migration 028 DELETEs remaining
 * mock rows using the actual seeded ID prefixes: brief-, dd-, CON-,
 * APR-, cap-, SCH-, RPT-, TPL-, CR-.
 *
 * Contract: After applying 028, rows with mock-pattern IDs are deleted.
 * The short uppercase prefixes (CON-, APR-, RPT-, CR-) are broad enough
 * to match plausible business IDs — this test documents the blast radius
 * by seeding adversarial rows that match the patterns.
 *
 * How to break: Change a LIKE pattern to be broader (e.g., 'C%' instead
 * of 'CON-%'), which would delete unrelated rows. Or remove FK-aware
 * ordering (scheduled_reports before report_templates) to cause
 * constraint violations.
 */

import { describe, it, expect, afterAll } from "vitest";
import { createSeededTestDb, applyMigration, destroyTestDb } from "./_harness";
import type pg from "pg";

let pool: pg.Pool;

afterAll(async () => {
  if (pool) await destroyTestDb(pool);
});

describe("Migration 028: fix mock data patterns", () => {
  it("deletes mock-pattern rows; adversarial prefix-matching rows are also deleted", async () => {
    pool = await createSeededTestDb("028_fix_mock_data_patterns.sql", {
      tables: [
        // --- contacts: LIKE 'CON-%' ---
        {
          table: "contacts",
          rows: [
            // Mock: seeded by migration 001/017
            { id: "CON-001", first_name: "Mock", last_name: "Contact" },
            // Adversarial: real contract-related contact with CON- prefix
            { id: "CON-real-contract-2024", first_name: "Jane", last_name: "Smith" },
            // Safe: different prefix, not matched
            { id: "contact-real-1", first_name: "Real", last_name: "Person" },
            // Safe: lowercase con- doesn't match LIKE 'CON-%' (case-sensitive)
            { id: "con-lowercase-test", first_name: "Case", last_name: "Test" },
          ],
        },
        // --- approvals: LIKE 'APR-%' ---
        {
          table: "approvals",
          rows: [
            // Mock
            { id: "APR-001", title: "Mock Approval", description: "test", category: "bid_decision", requester: "test", assignee: "test" },
            // Adversarial: real April-prefixed or approval-related ID
            { id: "APR-real-approval-gov", title: "Real Approval", description: "gov approval", category: "bid_decision", requester: "admin", assignee: "admin" },
            // Safe: different prefix
            { id: "approval-real-1", title: "Safe Approval", description: "safe", category: "bid_decision", requester: "admin", assignee: "admin" },
          ],
        },
        // --- report_templates: LIKE 'TPL-%', must be seeded before scheduled/generated ---
        {
          table: "report_templates",
          rows: [
            // Mock
            { id: "TPL-001", name: "Mock Template", category: "pipeline" },
            // Safe: different prefix
            { id: "template-real-1", name: "Real Template", category: "pipeline" },
          ],
        },
        // --- generated_reports: LIKE 'RPT-%' ---
        {
          table: "generated_reports",
          rows: [
            // Mock
            { id: "RPT-001", title: "Mock Report", template_id: "TPL-001" },
            // Adversarial: real report with RPT- prefix
            { id: "RPT-real-quarterly-2024", title: "Q4 Executive Summary", template_id: "template-real-1" },
            // Safe
            { id: "report-real-1", title: "Safe Report", template_id: "template-real-1" },
          ],
        },
        // --- compliance_requirements: LIKE 'CR-%' ---
        {
          table: "compliance_requirements",
          rows: [
            // Mock
            { id: "CR-001", solicitation_id: "SOL-001", solicitation_title: "Mock", section: "L", requirement: "test", category: "technical", responsible_party: "test" },
            // Adversarial: real change-request or compliance record with CR- prefix
            { id: "CR-real-change-request-42", solicitation_id: "SOL-real", solicitation_title: "Real SOL", section: "M", requirement: "real req", category: "technical", responsible_party: "admin" },
            // Safe
            { id: "compliance-real-1", solicitation_id: "SOL-real", solicitation_title: "Real", section: "L", requirement: "real", category: "technical", responsible_party: "admin" },
          ],
        },
      ],
    });

    // Verify pre-state counts
    const { rows: contactsBefore } = await pool.query("SELECT id FROM contacts ORDER BY id");
    expect(contactsBefore).toHaveLength(4);
    const { rows: approvalsBefore } = await pool.query("SELECT id FROM approvals ORDER BY id");
    expect(approvalsBefore).toHaveLength(3);
    const { rows: reportsBefore } = await pool.query("SELECT id FROM generated_reports ORDER BY id");
    expect(reportsBefore).toHaveLength(3);
    const { rows: complianceBefore } = await pool.query("SELECT id FROM compliance_requirements ORDER BY id");
    expect(complianceBefore).toHaveLength(3);

    await applyMigration(pool, "028_fix_mock_data_patterns.sql");

    // --- contacts: CON-001 deleted, CON-real-contract-2024 also deleted (matches CON-%) ---
    // LIKE 'CON-%' is case-sensitive in Postgres, so 'con-lowercase-test' survives
    const { rows: contactsAfter } = await pool.query("SELECT id FROM contacts ORDER BY id");
    expect(contactsAfter).toHaveLength(2);
    const contactIds = contactsAfter.map((r) => r.id);
    expect(contactIds).toContain("con-lowercase-test");
    expect(contactIds).toContain("contact-real-1");
    // Blast radius: CON-real-contract-2024 is deleted — any real ID starting with
    // 'CON-' would be caught. This is acceptable because the seeded mock IDs used
    // this exact prefix (CON-001 through CON-005) and no real data used it.

    // --- approvals: APR-001 deleted, APR-real-approval-gov also deleted ---
    const { rows: approvalsAfter } = await pool.query("SELECT id FROM approvals ORDER BY id");
    expect(approvalsAfter).toHaveLength(1);
    expect(approvalsAfter[0].id).toBe("approval-real-1");

    // --- generated_reports: RPT-001 deleted, RPT-real-quarterly-2024 also deleted ---
    const { rows: reportsAfter } = await pool.query("SELECT id FROM generated_reports ORDER BY id");
    expect(reportsAfter).toHaveLength(1);
    expect(reportsAfter[0].id).toBe("report-real-1");

    // --- report_templates: TPL-001 deleted (FK-safe because generated_reports cleaned first) ---
    const { rows: templatesAfter } = await pool.query("SELECT id FROM report_templates ORDER BY id");
    expect(templatesAfter).toHaveLength(1);
    expect(templatesAfter[0].id).toBe("template-real-1");

    // --- compliance_requirements: CR-001 deleted, CR-real-change-request-42 also deleted ---
    const { rows: complianceAfter } = await pool.query("SELECT id FROM compliance_requirements ORDER BY id");
    expect(complianceAfter).toHaveLength(1);
    expect(complianceAfter[0].id).toBe("compliance-real-1");
  });
});
