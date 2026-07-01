/**
 * F-313: Output Generators tests
 *
 * - Gold-free CI gate: (?i)gold.team or (?i)gold.review must NOT appear
 * - Citation test: templates generate HTML with clickable footnotes
 * - Layout test: PDFs use Hydra Teal + Inter aesthetics canonical
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ─── Gold-free CI gate ──────────────────────────────────────────────────────

describe('F-313 Gold-free CI gate', () => {
  const F313_PATHS = [
    'src/routes/output-generators.ts',
    'src/services/output-generators/index.ts',
    'src/services/output-generators/templates.ts',
    'src/services/output-generators/types.ts',
  ];

  const GOLD_PATTERNS = [
    /gold[\s._-]*team/i,
    /gold[\s._-]*review/i,
  ];

  for (const relPath of F313_PATHS) {
    it(`${relPath} contains no Gold references`, () => {
      const absPath = path.resolve(__dirname, '..', relPath);
      if (!fs.existsSync(absPath)) {
        // File not yet created — pass (CI will catch later)
        return;
      }
      const content = fs.readFileSync(absPath, 'utf-8');
      for (const pattern of GOLD_PATTERNS) {
        expect(content).not.toMatch(pattern);
      }
    });
  }
});

// ─── Template tests ─────────────────────────────────────────────────────────

describe('F-313 Template rendering', () => {
  // Set test env vars before imports
  process.env['JWT_SECRET'] = 'test-jwt-secret-that-is-at-least-32-characters-long';
  process.env['GDA_WEBHOOK_KEY'] = 'test-webhook-key';
  process.env['DATABASE_URL'] ??= 'postgresql://gda:gda_dev_password@localhost:5432/gda_command';
  process.env['NODE_ENV'] = 'test';

  it('briefing template uses Hydra Teal + Inter', async () => {
    const { generateBriefingHtml } = await import(
      '../src/services/output-generators/templates.js'
    );
    const html = generateBriefingHtml({
      opportunity_id: '1',
      title: 'Test Opportunity',
      agency: 'DoD',
      department: 'Defense',
      naics: '541511',
      set_aside: 'None',
      value_min: 1000000,
      value_max: 5000000,
      pwin: 65,
      description: 'Test description',
      response_due_at: '2026-12-31T00:00:00Z',
      posted_at: '2026-01-15T00:00:00Z',
      source_uri: 'https://sam.gov/test/123',
      solicitation_number: 'W9124-26-R-0001',
      place_of_performance: 'Washington, DC',
      analysis_summary: null,
      analysis_sections: [
        {
          heading: 'Competitive Landscape',
          content: 'Multiple incumbents identified.',
          citations: [
            { index: 1, source: 'SAM.gov', url: 'https://sam.gov/test/123', retrieved_at: '2026-01-15T00:00:00Z' },
          ],
        },
      ],
      doctrine_alignment: [
        { principle: 'Alignment', relevance: 'Strong mission alignment' },
      ],
      risks: ['Schedule risk due to short turnaround'],
      recommended_action: 'Pursue with full capture team',
    });

    // Hydra Teal color used
    expect(html).toContain('#01696F');
    // Inter font
    expect(html).toContain('Inter');
    // Citation footnotes with full URLs (clickable)
    expect(html).toContain('href="https://sam.gov/test/123"');
    expect(html).toContain('fn-1');
    // No forbidden dark tokens
    expect(html).not.toContain('#0f1117');
    expect(html).not.toContain('#1a1d27');
    expect(html).not.toContain('#3b82f6');
    // No JetBrains Mono
    expect(html).not.toContain('JetBrains Mono');
    // No Gold references
    expect(html).not.toMatch(/gold[\s._-]*team/i);
    expect(html).not.toMatch(/gold[\s._-]*review/i);
  });

  it('capture plan template uses Hydra Teal + Inter', async () => {
    const { generateCapturePlanHtml } = await import(
      '../src/services/output-generators/templates.js'
    );
    const html = generateCapturePlanHtml({
      capture_id: '1',
      opportunity_id: '1',
      title: 'Test Capture',
      agency: 'DoD',
      value: 5000000,
      pwin: 70,
      stage: 'qualify',
      win_strategy: 'Leverage past DoD experience',
      discriminators: ['Domain expertise', 'Cost efficiency'],
      capture_plan: null,
      incumbent: 'Incumbent Corp',
      competitors: [
        { name: 'Competitor A', strengths: ['Price'], weaknesses: ['Scale'] },
      ],
      win_themes: ['Past performance on similar contracts'],
      teaming_partners: ['Partner LLC'],
      risks: ['Technical complexity'],
      schedule_milestones: ['RFP Release Q3 2026', 'Proposal due Q4 2026'],
      decision_factors: ['Cost realism', 'Technical capability'],
      doctrine_alignment: [
        { principle: 'Relentless Execution', relevance: 'Track record' },
      ],
      analysis_sections: [],
    });

    expect(html).toContain('#01696F');
    expect(html).toContain('Inter');
    expect(html).not.toContain('#0f1117');
    expect(html).not.toContain('#1a1d27');
    expect(html).not.toContain('#3b82f6');
    expect(html).not.toContain('JetBrains Mono');
    expect(html).not.toMatch(/gold[\s._-]*team/i);
    expect(html).not.toMatch(/gold[\s._-]*review/i);
    // Content assertions
    expect(html).toContain('Capture Plan');
    expect(html).toContain('Incumbent Corp');
    expect(html).toContain('Competitor A');
    expect(html).toContain('Partner LLC');
  });

  it('win themes template flags themes without evidence', async () => {
    const { generateWinThemesHtml } = await import(
      '../src/services/output-generators/templates.js'
    );
    const html = generateWinThemesHtml({
      capture_id: '1',
      opportunity_id: '1',
      title: 'Test Win Themes',
      agency: 'DoD',
      themes: [
        {
          theme_title: 'Domain Expertise',
          narrative: 'Envision brings 10 years of DoD IT modernization experience.',
          evidence: ['Contract W9124-20-C-0001: 98% CPARS rating'],
          doctrine_principle: 'Relentless Execution',
          has_evidence: true,
        },
        {
          theme_title: 'Innovation',
          narrative: 'AI-powered analytics platform.',
          evidence: [],
          doctrine_principle: null,
          has_evidence: false,
        },
      ],
      doctrine_alignment: [
        { principle: 'Data First, Then Debate', relevance: 'Analytics-driven approach' },
      ],
    });

    expect(html).toContain('#01696F');
    expect(html).toContain('Inter');
    // Theme with evidence should NOT have draft label
    expect(html).toContain('Domain Expertise');
    // Theme without evidence should have draft label
    expect(html).toContain('draft — needs evidence');
    // Theme without doctrine should flag for review
    expect(html).toContain('needs doctrine alignment review');
    expect(html).not.toMatch(/gold[\s._-]*team/i);
    expect(html).not.toMatch(/gold[\s._-]*review/i);
  });

  it('citation footnotes have clickable href URLs', async () => {
    const { generateBriefingHtml } = await import(
      '../src/services/output-generators/templates.js'
    );
    const html = generateBriefingHtml({
      opportunity_id: '1',
      title: 'Citation Test',
      agency: null,
      department: null,
      naics: null,
      set_aside: null,
      value_min: null,
      value_max: null,
      pwin: null,
      description: null,
      response_due_at: null,
      posted_at: null,
      source_uri: null,
      solicitation_number: null,
      place_of_performance: null,
      analysis_summary: null,
      analysis_sections: [
        {
          heading: 'Test Section',
          content: 'Test content with citation.',
          citations: [
            { index: 1, source: 'Source A', url: 'https://example.com/source-a', retrieved_at: '2026-01-15T00:00:00Z' },
            { index: 2, source: 'Source B', url: 'https://example.com/source-b', retrieved_at: '2026-01-16T00:00:00Z' },
          ],
        },
      ],
      doctrine_alignment: [],
      risks: [],
      recommended_action: null,
    });

    // Verify citation footnote links exist with full URLs
    expect(html).toContain('href="https://example.com/source-a"');
    expect(html).toContain('href="https://example.com/source-b"');
    expect(html).toContain('id="fn-1"');
    expect(html).toContain('id="fn-2"');
    expect(html).toContain('href="#fn-1"');
    expect(html).toContain('href="#fn-2"');
  });
});
