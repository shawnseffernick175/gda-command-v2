/**
 * Sub-agent prompts per color.
 *
 * Each color defines: role, tool budget, output schema, and grading rubric.
 * Tool registry calls go through F-300 Agent Runtime when live.
 * Until F-300 ships, the stub runner uses these prompts for documentation
 * and fixture generation.
 */

import type { ColorTeamColor } from './types.js';

export interface ColorPrompt {
  color: ColorTeamColor;
  role: string;
  description: string;
  tools: string[];
  outputSchema: string;
}

export const COLOR_PROMPTS: Record<ColorTeamColor, ColorPrompt> = {
  pink: {
    color: 'pink',
    role: 'Storyboard / Outline Reviewer',
    description:
      'Review the uploaded document for compliance matrix alignment against the RFP, ' +
      'win-theme placement, ghost-competitor positioning, and structural gaps. ' +
      'Check that the document outline follows Shipley best practices.',
    tools: ['rag_search', 'win_theme_library', 'capture_plan_lookup'],
    outputSchema: 'severity, section_ref, finding, recommended_fix, citations[]',
  },
  red: {
    color: 'red',
    role: 'Draft Proposal Evaluator',
    description:
      'Score each section as a government evaluator would using Section L/M criteria. ' +
      'Identify weak claims, scoring risk, evidence gaps, and unsupported assertions. ' +
      'Apply the LPTA or best-value rubric as appropriate.',
    tools: ['rag_search', 'cpar_lookup', 'scoring_rubric'],
    outputSchema: 'severity, section_ref, finding, recommended_fix, citations[]',
  },
  black: {
    color: 'black',
    role: 'Adversarial Competitor Simulator',
    description:
      'For each named competitor, project what they will bid, price, themes, attack ' +
      'angles, and discriminator counters. Use GovWin, GovTribe, and USAspending data ' +
      'to ground competitor intelligence.',
    tools: ['govwin_search', 'govtribe_search', 'usaspending_search', 'rag_search'],
    outputSchema: 'severity, section_ref, finding, recommended_fix, citations[]',
  },
  blue: {
    color: 'blue',
    role: 'Customer Perspective Reviewer',
    description:
      'Read the document as the CO / COR / PM would. Assess whether pain points are ' +
      'addressed, risk tolerance matched, and past-performance relevance established ' +
      'for this specific customer.',
    tools: ['rag_search', 'agency_history', 'cpar_lookup'],
    outputSchema: 'severity, section_ref, finding, recommended_fix, citations[]',
  },
  white: {
    color: 'white',
    role: 'Compliance Sweep Reviewer',
    description:
      'Perform a Section L/M crosswalk, verify FAR clause compliance, check page/font/' +
      'format limits, and confirm all mandatory submittals are present.',
    tools: ['rag_search', 'far_ref_store'],
    outputSchema: 'severity, section_ref, finding, recommended_fix, citations[]',
  },
  green: {
    color: 'green',
    role: 'Executive / Final Pass Reviewer',
    description:
      'Pricing review (labor mix, margin vs. competitor history, USAspending pricing ' +
      'data, FFP risk). Enforce 8% margin floor. Run exclusion check. Generate full ' +
      'doctrine alignment scorecard using the 8 GDA doctrine principles. ' +
      'Produce signature-ready verdict. Green absorbs what would have been Gold.',
    tools: [
      'doctrine_check',
      'pricing_lookup',
      'usaspending_search',
      'rag_search',
      'exclusion_check',
    ],
    outputSchema:
      'severity, section_ref, finding, recommended_fix, citations[], ' +
      'doctrine_score[], exclusion_hits[], margin_check{}',
  },
};

/** The 8 doctrine principle names from F-303 (verbatim, no paraphrasing). */
export const DOCTRINE_PRINCIPLES = [
  'Alignment',
  'Ethics Always',
  'Teamwork',
  'Data First, Then Debate',
  'Relentless Execution',
  'Relationships',
  'Market, Mission, Brand Focus',
  'Decision Filter Compliance',
] as const;
