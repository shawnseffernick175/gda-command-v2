/**
 * Document classifier tests — F-304.
 *
 * Fixture pack: representative doc text snippets per type.
 * Classifier accuracy must be >= 85% on this set.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock LLM router and DB before importing classifier
vi.mock('../../../src/lib/llm-router.js', () => ({
  llmRouter: {
    route: vi.fn().mockResolvedValue({ ok: false, output: null }),
  },
}));

vi.mock('../../../src/lib/db.js', () => ({
  pool: {
    query: vi.fn().mockResolvedValue({ rows: [] }),
  },
}));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { classifyDocument } from '../../../src/services/ingest/classifier.js';

interface TestFixture {
  name: string;
  filename: string;
  text: string;
  expectedSurface: string;
  expectedEntityType: string;
}

const FIXTURES: TestFixture[] = [
  // Opportunities (5)
  {
    name: 'RFP solicitation',
    filename: 'W911QX-26-R-0042.pdf',
    text: 'SOLICITATION NUMBER: W911QX-26-R-0042. NAICS 541715. Full and open competition. Proposals due August 15, 2026. The Army Contracting Command seeks logistics support services.',
    expectedSurface: 'opportunities',
    expectedEntityType: 'opportunity',
  },
  {
    name: 'Sources sought notice',
    filename: 'sources-sought-cybersecurity.pdf',
    text: 'Sources Sought Notice. The Department of Defense is conducting market research for cybersecurity services under NAICS 541512. Set-aside: HUBZone. Response deadline: July 30, 2026.',
    expectedSurface: 'opportunities',
    expectedEntityType: 'opportunity',
  },
  {
    name: 'SAM.gov presolicitation',
    filename: 'presol-notice.docx',
    text: 'SAM.gov presolicitation notice for IT modernization services. Notice ID: FA8750-26-R-0001. NAICS Code 541511. Combined synopsis/solicitation. Closing date September 2026.',
    expectedSurface: 'opportunities',
    expectedEntityType: 'opportunity',
  },
  {
    name: 'RFI document',
    filename: 'RFI-training-services.pdf',
    text: 'REQUEST FOR INFORMATION (RFI). The US Army Training and Doctrine Command seeks information on training simulation capabilities. NAICS 611430.',
    expectedSurface: 'opportunities',
    expectedEntityType: 'opportunity',
  },
  {
    name: 'Amendment to solicitation',
    filename: 'amendment-001.pdf',
    text: 'AMENDMENT OF SOLICITATION. Amendment Number: 001. RFP W911QX-26-R-0042. This amendment extends the proposal due date to September 1, 2026.',
    expectedSurface: 'opportunities',
    expectedEntityType: 'opportunity',
  },

  // Capture documents (5)
  {
    name: 'Capture plan',
    filename: 'capture-plan-rs3.docx',
    text: 'CAPTURE PLAN — RS3 Recompete. Win themes: operational readiness, mission assurance. Discriminators: 15 years Army logistics. Cost volume approach: FFP.',
    expectedSurface: 'capture',
    expectedEntityType: 'capture_doc',
  },
  {
    name: 'Technical volume',
    filename: 'tech-volume-draft-v2.docx',
    text: 'Technical Volume — Section L compliance matrix. Key personnel: Program Manager. Management volume approach. Past performance volume references.',
    expectedSurface: 'capture',
    expectedEntityType: 'capture_doc',
  },
  {
    name: 'Pricing spreadsheet',
    filename: 'pricing-model-v3.xlsx',
    text: 'Pricing model. Cost volume. Labor rates by category. Wrap rates. Fee structure. Bid price calculation. BOE (Basis of Estimate).',
    expectedSurface: 'capture',
    expectedEntityType: 'capture_doc',
  },
  {
    name: 'Proposal outline',
    filename: 'proposal-outline.docx',
    text: 'Proposal outline for OASIS task order. Section B - Supplies or Services. Section C - Statement of Work. Win strategy overview.',
    expectedSurface: 'capture',
    expectedEntityType: 'capture_doc',
  },
  {
    name: 'Compliance matrix',
    filename: 'compliance-matrix.xlsx',
    text: 'Compliance matrix. Section L requirements. Section M evaluation criteria. Proposal volume assignments. Bid/no-bid decision.',
    expectedSurface: 'capture',
    expectedEntityType: 'capture_doc',
  },

  // Financial documents (5)
  {
    name: 'P&L statement',
    filename: 'envision-P&L-may-2026.xlsx',
    text: 'INCOME STATEMENT. Envision Innovative Solutions. Revenue: $3,245,000. Cost of goods sold. Gross margin. Operating expenses. EBITDA.',
    expectedSurface: 'financials',
    expectedEntityType: 'financial_doc',
  },
  {
    name: 'Balance sheet',
    filename: 'balance-sheet-q2-2026.xlsx',
    text: 'BALANCE SHEET as of June 30, 2026. Total assets. Accounts receivable. Accounts payable. Stockholders equity.',
    expectedSurface: 'financials',
    expectedEntityType: 'financial_doc',
  },
  {
    name: 'Budget forecast',
    filename: 'fy26-budget-forecast.xlsx',
    text: 'FY26 Budget Forecast. Revenue projections by project. Cost detail by category. SIE breakdown. GL detail entries.',
    expectedSurface: 'financials',
    expectedEntityType: 'financial_doc',
  },
  {
    name: 'Accounts payable report',
    filename: 'AP-aging-june-2026.xlsx',
    text: 'Accounts Payable aging report. Vendor invoices. 30/60/90 day aging. Payment schedule. Trial balance reconciliation.',
    expectedSurface: 'financials',
    expectedEntityType: 'financial_doc',
  },
  {
    name: 'Cost detail report',
    filename: 'cost-detail-report.xlsx',
    text: 'Cost detail by project. Direct labor hours. Material costs. Subcontractor expenses. General ledger entries. Indirect cost pool allocation.',
    expectedSurface: 'financials',
    expectedEntityType: 'financial_doc',
  },

  // Regulatory (5)
  {
    name: 'FAR clause',
    filename: 'far-52-212-1.pdf',
    text: 'FAR 52.212-1 Instructions to Offerors. Federal Acquisition Regulation. Compliance requirement for commercial item acquisitions.',
    expectedSurface: 'regulatory',
    expectedEntityType: 'regulatory_notice',
  },
  {
    name: 'DFARS notice',
    filename: 'dfars-cybersecurity.pdf',
    text: 'DFARS 252.204-7012. Safeguarding covered defense information. NIST SP 800-171. CMMC Level 2 requirement. Compliance deadline.',
    expectedSurface: 'regulatory',
    expectedEntityType: 'regulatory_notice',
  },
  {
    name: 'NDAA provision',
    filename: 'ndaa-fy26-section-889.pdf',
    text: 'NDAA FY2026 Section 889. Prohibition on certain telecommunications equipment. Compliance certification required.',
    expectedSurface: 'regulatory',
    expectedEntityType: 'regulatory_notice',
  },
  {
    name: 'Executive order',
    filename: 'eo-14028-cybersecurity.pdf',
    text: 'Executive Order 14028 - Improving the Nations Cybersecurity. Federal Register notice. Final rule implementing EO 14028 requirements.',
    expectedSurface: 'regulatory',
    expectedEntityType: 'regulatory_notice',
  },
  {
    name: 'Federal Register rule',
    filename: 'interim-rule-supply-chain.pdf',
    text: 'Federal Register interim rule. Supply chain risk management. CFR Title 48. Final rule effective date October 2026.',
    expectedSurface: 'regulatory',
    expectedEntityType: 'regulatory_notice',
  },

  // Partner documents (5)
  {
    name: 'Teaming agreement',
    filename: 'teaming-agreement-riverstone.pdf',
    text: 'TEAMING AGREEMENT between Envision Innovative Solutions and Riverstone Solutions. HUBZone set-aside pursuit. Joint venture terms.',
    expectedSurface: 'partner_intel',
    expectedEntityType: 'partner_doc',
  },
  {
    name: 'Subcontract agreement',
    filename: 'subcontract-pd-systems.pdf',
    text: 'SUBCONTRACT AGREEMENT. PD Systems as subcontractor to Envision. Training simulation scope. Mentor-protege arrangement.',
    expectedSurface: 'partner_intel',
    expectedEntityType: 'partner_doc',
  },
  {
    name: 'HUBZone cert document',
    filename: 'hubzone-cert-rsi.pdf',
    text: 'Riverstone Solutions HUBZone certification. SBA-certified. WOSB status. Small Disadvantaged Business designation.',
    expectedSurface: 'partner_intel',
    expectedEntityType: 'partner_doc',
  },
  {
    name: 'Joint venture agreement',
    filename: 'jv-agreement-draft.docx',
    text: 'JOINT VENTURE between Envision and Riverstone for HUBZone set-aside contracts. Teaming arrangement terms.',
    expectedSurface: 'partner_intel',
    expectedEntityType: 'partner_doc',
  },
  {
    name: 'Partner capability brief',
    filename: 'pd-systems-capability.pdf',
    text: 'PD Systems capability statement. XR/AR/VR training platforms. LVC integration. WOSB certified. Teaming partnership with Envision.',
    expectedSurface: 'partner_intel',
    expectedEntityType: 'partner_doc',
  },

  // Action items (5)
  {
    name: 'Task list email',
    filename: 'action-items-weekly.txt',
    text: 'ACTION ITEMS from Monday staff meeting. Task: Follow up with Angela about SHIELD capacity. Assigned to: Shawn. Due date: July 15, 2026.',
    expectedSurface: 'action_items',
    expectedEntityType: 'action_item',
  },
  {
    name: 'Follow-up memo',
    filename: 'follow-up-memo.docx',
    text: 'FOLLOW UP REQUIRED: Pending action on CMMI recertification. Deadline August 7, 2026. Action required by CTO.',
    expectedSurface: 'action_items',
    expectedEntityType: 'action_item',
  },
  {
    name: 'Task assignment',
    filename: 'task-assignment.txt',
    text: 'TODO: Complete SAM.gov registration update before July 31. Assigned to admin team. Follow up with contracting officer.',
    expectedSurface: 'action_items',
    expectedEntityType: 'action_item',
  },
  {
    name: 'Meeting action items',
    filename: 'meeting-notes-actions.docx',
    text: 'Meeting notes. Action item 1: Schedule CMMC assessment. Due date: August 2026. Action item 2: Update capability statement.',
    expectedSurface: 'action_items',
    expectedEntityType: 'action_item',
  },
  {
    name: 'Deadline reminder',
    filename: 'deadline-reminder.txt',
    text: 'Pending action: Submit quarterly CPAR responses. Deadline approaching. Task assigned to PM team. Follow up required.',
    expectedSurface: 'action_items',
    expectedEntityType: 'action_item',
  },
];

describe('Document Classifier', () => {
  it('classifies all 30 fixtures with >= 85% accuracy', async () => {
    let correct = 0;
    const failures: string[] = [];

    for (const fixture of FIXTURES) {
      const result = await classifyDocument(fixture.text, fixture.filename, null);

      if (result.surface === fixture.expectedSurface) {
        correct++;
      } else {
        failures.push(
          `"${fixture.name}" (${fixture.filename}): expected surface="${fixture.expectedSurface}" got "${result.surface}" (confidence=${result.confidence})`,
        );
      }
    }

    const accuracy = correct / FIXTURES.length;
    const pct = Math.round(accuracy * 100);

    if (failures.length > 0) {
      console.log(`\nClassifier failures (${failures.length}/${FIXTURES.length}):`);
      failures.forEach((f) => console.log(`  - ${f}`));
    }

    console.log(`\nClassifier accuracy: ${pct}% (${correct}/${FIXTURES.length})`);
    expect(accuracy).toBeGreaterThanOrEqual(0.85);
  });

  it('returns confidence scores between 0 and 1', async () => {
    for (const fixture of FIXTURES) {
      const result = await classifyDocument(fixture.text, fixture.filename, null);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('detects doctrine flags for OU2/OU3 content', async () => {
    const result = await classifyDocument(
      'Riverstone Solutions OU-II Intelligence & Cyber Engineering capability statement.',
      'rsi-capability.pdf',
      null,
    );
    expect(result.doctrine_flag).toBe('OU2');
  });

  it('routes low-confidence docs to inbox', async () => {
    const result = await classifyDocument(
      'This is a generic document with no clear classification signals.',
      'random-doc.pdf',
      null,
    );
    // Low confidence should route to inbox or use the surface hint fallback
    expect(result.confidence).toBeLessThan(0.8);
  });

  it('respects source surface hint', async () => {
    const result = await classifyDocument(
      'Generic document content without strong signals.',
      'misc-file.txt',
      'capture',
    );
    expect(result.surface).toBe('capture');
  });

  it('assigns evidence grades based on confidence', async () => {
    for (const fixture of FIXTURES) {
      const result = await classifyDocument(fixture.text, fixture.filename, null);
      if (result.confidence >= 0.8) {
        expect(result.evidence_grade).toBe('A');
      } else if (result.confidence >= 0.6) {
        expect(result.evidence_grade).toBe('B');
      } else {
        expect(['B', 'C']).toContain(result.evidence_grade);
      }
    }
  });
});
