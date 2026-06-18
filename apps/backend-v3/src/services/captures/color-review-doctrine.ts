/**
 * Color Review Doctrine — F-868
 *
 * Single source of truth for the 6-color Shipley review order and meaning.
 * The CEO directive defines a strict ordering (black -> blue -> pink -> green -> red -> white).
 * Any feature that needs the color order, phase, completion window, focus, or the
 * doctrine-appropriate seeded sections for a color MUST read it from here — do not
 * hard-code the order anywhere else.
 */

export type ReviewColor = 'black' | 'blue' | 'pink' | 'green' | 'red' | 'white';
export type ReviewPhase = 'pre_rfp' | 'post_rfp';

export interface ColorDoctrine {
  color: ReviewColor;
  order: number; // 1..6
  label: string; // human-readable label, e.g. "Black Hat", "White/Gold"
  phase: ReviewPhase;
  completion_pct: string; // e.g. "30-50%", "95-100%", "" for pre-RFP
  focus: string; // one-sentence doctrine focus
  seeded_sections: string[]; // focus-appropriate section_name list this color should seed
}

/**
 * The canonical ordered doctrine. Length 6, ordered by `order` (1..6).
 * Order and meaning per CEO directive (Shipley capture/proposal lifecycle).
 */
export const COLOR_DOCTRINE: ColorDoctrine[] = [
  {
    color: 'black',
    order: 1,
    label: 'Black Hat',
    phase: 'pre_rfp',
    completion_pct: '',
    focus:
      'Competitor intelligence: role-play each competitor, project their price and themes, and plan how to neutralize them.',
    seeded_sections: [
      'Competitor Field',
      'Likely Pricing & Themes',
      'Our Discriminators vs Each Competitor',
      'Ghosting Strategy',
    ],
  },
  {
    color: 'blue',
    order: 2,
    label: 'Blue',
    phase: 'pre_rfp',
    completion_pct: '',
    focus:
      'Capture strategy and win themes: review the capture plan, solution architecture, and win themes (blueprint, no proposal text yet).',
    seeded_sections: [
      'Win Themes',
      'Solution Architecture',
      'Capture Plan Health',
      'Customer Hot Buttons',
    ],
  },
  {
    color: 'pink',
    order: 3,
    label: 'Pink',
    phase: 'post_rfp',
    completion_pct: '30-50%',
    focus:
      'Storyboards and framework compliance: every solicitation requirement mapped to a proposal section.',
    seeded_sections: [
      'Storyboard Completeness',
      'Requirement-to-Section Map',
      'Graphics & Mockups',
      'Compliance Framework',
    ],
  },
  {
    color: 'green',
    order: 4,
    label: 'Green',
    phase: 'post_rfp',
    completion_pct: '',
    focus:
      'Pricing and cost volume: confirm the price matches the technical solution and is both competitive and profitable.',
    seeded_sections: [
      'Price-to-Solution Alignment',
      'Cost Realism',
      'Competitiveness vs PTW',
      'Margin & Profitability',
    ],
  },
  {
    color: 'red',
    order: 5,
    label: 'Red',
    phase: 'post_rfp',
    completion_pct: '80-90%',
    focus:
      'Government evaluation panel simulation: grade against the official evaluation criteria — the most intense review.',
    seeded_sections: [
      'Section M Factor Scoring',
      'Compliance (Section L Shall)',
      'Argument Strength',
      'Clarity & Evaluator Readability',
    ],
  },
  {
    color: 'white',
    order: 6,
    label: 'White/Gold',
    phase: 'post_rfp',
    completion_pct: '95-100%',
    focus:
      'Final executive sanity check: confirm all Red Team edits are implemented, then package and submit.',
    seeded_sections: [
      'All Red Edits Implemented',
      'Formatting & Presentation',
      'Executive Sign-off',
      'Submission Package Checklist',
    ],
  },
];

const BY_COLOR: Record<string, ColorDoctrine> = COLOR_DOCTRINE.reduce(
  (acc, d) => {
    acc[d.color] = d;
    return acc;
  },
  {} as Record<string, ColorDoctrine>,
);

/** Look up the doctrine entry for a color. Returns undefined for unknown colors. */
export function doctrineFor(color: string): ColorDoctrine | undefined {
  return BY_COLOR[color];
}

/**
 * All colors that precede the given color in doctrine order (order < this color's order),
 * returned in ascending doctrine order. Returns [] for the first color or an unknown color.
 */
export function priorColors(color: string): ColorDoctrine[] {
  const d = BY_COLOR[color];
  if (!d) return [];
  return COLOR_DOCTRINE.filter((c) => c.order < d.order).sort((a, b) => a.order - b.order);
}
