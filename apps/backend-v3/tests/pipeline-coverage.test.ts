/**
 * Unit tests for Pipeline Coverage — Shipley Capture Management Lifecycle (#887).
 *
 * Covers:
 *   - Layer math: correct stage rollup for all 4 layers
 *   - $1 IDIQ exclusion: rows with value ≤ 1 excluded from sums
 *   - Override vs default Pwin: per-pursuit pwin_override takes precedence
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ── Inline the pure computation logic for unit testing ──────── */

const DEFAULT_STAGE_PWIN: Record<string, number> = {
  interest: 0.10,
  qualify: 0.25,
  pursue: 0.50,
  solicitation: 0.75,
  post_submittal: 1.00,
};

const LAYER_CONFIG = {
  total_qualified: {
    label: 'Total Qualified',
    multiple_min: 5,
    multiple_max: null,
    stages: ['qualify', 'pursue', 'solicitation', 'post_submittal'] as string[],
  },
  active_capture: {
    label: 'Active Capture',
    multiple_min: 3,
    multiple_max: null,
    stages: ['pursue', 'solicitation', 'post_submittal'] as string[],
  },
  bid_proposal: {
    label: 'Bid & Proposal',
    multiple_min: 1.5,
    multiple_max: 2,
    stages: ['solicitation', 'post_submittal'] as string[],
  },
  pwin_weighted: {
    label: 'Pwin-Weighted',
    multiple_min: 1,
    multiple_max: null,
    stages: null as null,
  },
} as const;

type LayerKey = keyof typeof LAYER_CONFIG;

const LAYER_ORDER: LayerKey[] = [
  'total_qualified',
  'active_capture',
  'bid_proposal',
  'pwin_weighted',
];

interface Pursuit {
  stage: string;
  value: number;
  pwin_override: number | null;
}

interface LayerResult {
  key: string;
  label: string;
  required_min: number;
  required_max: number | null;
  actual: number;
  multiple: number;
  status: 'green' | 'yellow' | 'red';
}

function statusFromRatio(ratio: number): 'green' | 'yellow' | 'red' {
  if (ratio >= 1.0) return 'green';
  if (ratio >= 0.8) return 'yellow';
  return 'red';
}

function computeLayers(
  aopTarget: number,
  pursuits: Pursuit[],
  configPwin: Record<string, number> = DEFAULT_STAGE_PWIN,
): LayerResult[] {
  // Filter $1 IDIQ rows
  const active = pursuits.filter((p) => p.value > 1);

  // Resolve pwin per pursuit
  const enriched = active.map((p) => ({
    ...p,
    resolvedPwin: p.pwin_override ?? configPwin[p.stage] ?? DEFAULT_STAGE_PWIN[p.stage] ?? 0,
  }));

  return LAYER_ORDER.map((key) => {
    const cfg = LAYER_CONFIG[key];
    const requiredMin = aopTarget * cfg.multiple_min;
    const requiredMax = cfg.multiple_max != null ? aopTarget * cfg.multiple_max : null;

    let actual: number;
    if (key === 'pwin_weighted') {
      actual = enriched.reduce((sum, p) => sum + p.value * p.resolvedPwin, 0);
    } else {
      const stageSet = new Set(cfg.stages);
      actual = enriched
        .filter((p) => stageSet.has(p.stage))
        .reduce((sum, p) => sum + p.value, 0);
    }

    const multiple = aopTarget > 0 ? Math.round((actual / aopTarget) * 10) / 10 : 0;
    const ratio = requiredMin > 0 ? actual / requiredMin : 1;
    const status = statusFromRatio(ratio);

    return { key, label: cfg.label, required_min: requiredMin, required_max: requiredMax, actual: Math.round(actual), multiple, status };
  });
}

/* ── Tests ────────────────────────────────────────────────────── */

describe('Pipeline Coverage — layer math', () => {
  const AOP = 44_800_000;

  it('computes all four layers with correct stage rollup', () => {
    const pursuits: Pursuit[] = [
      { stage: 'qualify', value: 50_000_000, pwin_override: null },
      { stage: 'pursue', value: 80_000_000, pwin_override: null },
      { stage: 'solicitation', value: 40_000_000, pwin_override: null },
      { stage: 'post_submittal', value: 20_000_000, pwin_override: null },
    ];

    const layers = computeLayers(AOP, pursuits);

    // total_qualified = qualify + pursue + solicitation + post_submittal = 190M
    expect(layers[0]!.key).toBe('total_qualified');
    expect(layers[0]!.actual).toBe(190_000_000);
    expect(layers[0]!.required_min).toBe(224_000_000); // 5 × 44.8M

    // active_capture = pursue + solicitation + post_submittal = 140M
    expect(layers[1]!.key).toBe('active_capture');
    expect(layers[1]!.actual).toBe(140_000_000);
    expect(layers[1]!.required_min).toBe(134_400_000); // 3 × 44.8M

    // bid_proposal = solicitation + post_submittal = 60M
    expect(layers[2]!.key).toBe('bid_proposal');
    expect(layers[2]!.actual).toBe(60_000_000);
    expect(layers[2]!.required_min).toBe(67_200_000); // 1.5 × 44.8M
    expect(layers[2]!.required_max).toBe(89_600_000); // 2 × 44.8M

    // pwin_weighted = 50M×0.25 + 80M×0.50 + 40M×0.75 + 20M×1.00 = 12.5+40+30+20 = 102.5M
    expect(layers[3]!.key).toBe('pwin_weighted');
    expect(layers[3]!.actual).toBe(102_500_000);
    expect(layers[3]!.required_min).toBe(44_800_000); // 1 × 44.8M
  });

  it('interest-stage pursuits excluded from total_qualified but included in pwin_weighted', () => {
    const pursuits: Pursuit[] = [
      { stage: 'interest', value: 100_000_000, pwin_override: null },
      { stage: 'qualify', value: 50_000_000, pwin_override: null },
    ];

    const layers = computeLayers(AOP, pursuits);

    // total_qualified should NOT include 'interest'
    expect(layers[0]!.actual).toBe(50_000_000);

    // pwin_weighted includes everything: 100M×0.10 + 50M×0.25 = 10M+12.5M = 22.5M
    expect(layers[3]!.actual).toBe(22_500_000);
  });

  it('empty pipeline yields zero actuals and red status', () => {
    const layers = computeLayers(AOP, []);

    for (const layer of layers) {
      expect(layer.actual).toBe(0);
      expect(layer.status).toBe('red');
    }
  });

  it('status transitions: green ≥ 1.0, yellow 0.8-1.0, red < 0.8', () => {
    expect(statusFromRatio(1.0)).toBe('green');
    expect(statusFromRatio(1.5)).toBe('green');
    expect(statusFromRatio(0.9)).toBe('yellow');
    expect(statusFromRatio(0.8)).toBe('yellow');
    expect(statusFromRatio(0.79)).toBe('red');
    expect(statusFromRatio(0)).toBe('red');
  });
});

describe('Pipeline Coverage — $1 IDIQ exclusion', () => {
  const AOP = 44_800_000;

  it('excludes $1 IDIQ placeholder values from all layer sums', () => {
    const pursuits: Pursuit[] = [
      { stage: 'qualify', value: 1, pwin_override: null },       // $1 IDIQ — excluded
      { stage: 'qualify', value: 0, pwin_override: null },       // $0 — excluded
      { stage: 'pursue', value: 80_000_000, pwin_override: null },
    ];

    const layers = computeLayers(AOP, pursuits);

    // total_qualified should only include the $80M pursue
    expect(layers[0]!.actual).toBe(80_000_000);

    // pwin_weighted = 80M × 0.50 = 40M (no $1 items)
    expect(layers[3]!.actual).toBe(40_000_000);
  });

  it('$1 values excluded even from pwin_weighted', () => {
    const pursuits: Pursuit[] = [
      { stage: 'interest', value: 1, pwin_override: null },
    ];

    const layers = computeLayers(AOP, pursuits);
    expect(layers[3]!.actual).toBe(0);
  });
});

describe('Pipeline Coverage — override vs default Pwin', () => {
  const AOP = 44_800_000;

  it('uses pwin_override when set, otherwise falls back to default stage pwin', () => {
    const pursuits: Pursuit[] = [
      { stage: 'qualify', value: 100_000_000, pwin_override: 0.60 },  // override: 60%
      { stage: 'pursue', value: 50_000_000, pwin_override: null },     // default: 50%
    ];

    const layers = computeLayers(AOP, pursuits);

    // pwin_weighted = 100M×0.60 + 50M×0.50 = 60M + 25M = 85M
    expect(layers[3]!.actual).toBe(85_000_000);
  });

  it('override of 0.0 forces zero contribution', () => {
    const pursuits: Pursuit[] = [
      { stage: 'solicitation', value: 100_000_000, pwin_override: 0.0 },
    ];

    const layers = computeLayers(AOP, pursuits);

    // pwin_weighted = 100M × 0.0 = 0
    expect(layers[3]!.actual).toBe(0);

    // But bid_proposal still includes the raw value
    expect(layers[2]!.actual).toBe(100_000_000);
  });

  it('respects custom configPwin from wheelhouse_config', () => {
    const customPwin = { ...DEFAULT_STAGE_PWIN, qualify: 0.40 };
    const pursuits: Pursuit[] = [
      { stage: 'qualify', value: 100_000_000, pwin_override: null },
    ];

    const layers = computeLayers(AOP, pursuits, customPwin);

    // pwin_weighted = 100M × 0.40 = 40M
    expect(layers[3]!.actual).toBe(40_000_000);
  });
});
