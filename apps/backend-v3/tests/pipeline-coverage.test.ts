/**
 * Unit tests for Pipeline Coverage — capture-lifecycle funnel.
 *
 * Covers:
 *   - Layer math: correct stage rollup for all 5 layers (AOP, Identification,
 *     Pursuit, Capture, Proposal)
 *   - Required = AOP revenue target × layer multiple (recomputes with the target)
 *   - $1 IDIQ exclusion: rows with value ≤ 1 excluded from sums
 */

import { describe, it, expect } from 'vitest';

/* ── Inline the pure computation logic for unit testing ──────── */

const LAYER_CONFIG = {
  aop: {
    label: 'AOP',
    multiple: 10,
    // 'qualify' staging is excluded from metrics; 'qualified' is the first counted stage.
    stages: ['interest', 'qualified', 'pursue', 'solicitation', 'post_submittal'] as string[],
  },
  identification: {
    label: 'Identification',
    multiple: 5,
    stages: ['qualified', 'pursue', 'solicitation', 'post_submittal'] as string[],
  },
  pursuit: {
    label: 'Pursuit',
    multiple: 2.5,
    stages: ['pursue', 'solicitation', 'post_submittal'] as string[],
  },
  capture: {
    label: 'Capture',
    multiple: 1.25,
    stages: ['solicitation', 'post_submittal'] as string[],
  },
  proposal: {
    label: 'Proposal',
    multiple: 0.65,
    stages: ['post_submittal'] as string[],
  },
} as const;

type LayerKey = keyof typeof LAYER_CONFIG;

const LAYER_ORDER: LayerKey[] = ['aop', 'identification', 'pursuit', 'capture', 'proposal'];

interface Pursuit {
  stage: string;
  value: number;
}

interface LayerResult {
  key: string;
  label: string;
  required_min: number;
  required_max: number | null;
  actual: number;
  multiple: number;
  coverage: number;
  status: 'green' | 'yellow' | 'red';
}

function statusFromRatio(ratio: number): 'green' | 'yellow' | 'red' {
  if (ratio >= 1.0) return 'green';
  if (ratio >= 0.8) return 'yellow';
  return 'red';
}

function computeLayers(aopTarget: number, pursuits: Pursuit[]): LayerResult[] {
  // Filter $1 IDIQ / $0 rows
  const active = pursuits.filter((p) => p.value > 1);

  return LAYER_ORDER.map((key) => {
    const cfg = LAYER_CONFIG[key];
    const requiredMin = aopTarget * cfg.multiple;

    const stageSet = new Set(cfg.stages);
    const actual = active
      .filter((p) => stageSet.has(p.stage))
      .reduce((sum, p) => sum + p.value, 0);

    // `multiple` is the layer's fixed multiplier of the AOP target (AOP ×10 …);
    // `coverage` = actual ÷ Required, which drives the status dot.
    const ratio = requiredMin > 0 ? actual / requiredMin : 1;
    const coverage = requiredMin > 0 ? Math.round(ratio * 100) / 100 : 0;
    const status = statusFromRatio(ratio);

    return { key, label: cfg.label, required_min: requiredMin, required_max: null, actual: Math.round(actual), multiple: cfg.multiple, coverage, status };
  });
}

/* ── Tests ────────────────────────────────────────────────────── */

describe('Pipeline Coverage — layer math', () => {
  const AOP = 44_800_000;

  it('computes all five layers with correct nested stage rollup', () => {
    const pursuits: Pursuit[] = [
      { stage: 'interest', value: 100_000_000 },
      { stage: 'qualified', value: 50_000_000 },
      { stage: 'pursue', value: 80_000_000 },
      { stage: 'solicitation', value: 40_000_000 },
      { stage: 'post_submittal', value: 20_000_000 },
    ];

    const layers = computeLayers(AOP, pursuits);

    // AOP (×10) = all counted stages (interest + qualified..post) = 290M
    expect(layers[0]!.key).toBe('aop');
    expect(layers[0]!.actual).toBe(290_000_000);
    expect(layers[0]!.required_min).toBe(448_000_000); // 10 × 44.8M

    // Identification (×5) = qualified + pursue + sol + post = 190M
    expect(layers[1]!.key).toBe('identification');
    expect(layers[1]!.actual).toBe(190_000_000);
    expect(layers[1]!.required_min).toBe(224_000_000); // 5 × 44.8M

    // Pursuit (×2.5) = pursue + sol + post = 140M
    expect(layers[2]!.key).toBe('pursuit');
    expect(layers[2]!.actual).toBe(140_000_000);
    expect(layers[2]!.required_min).toBe(112_000_000); // 2.5 × 44.8M

    // Capture (×1.25) = sol + post = 60M
    expect(layers[3]!.key).toBe('capture');
    expect(layers[3]!.actual).toBe(60_000_000);
    expect(layers[3]!.required_min).toBe(56_000_000); // 1.25 × 44.8M

    // Proposal (×0.65) = post = 20M
    expect(layers[4]!.key).toBe('proposal');
    expect(layers[4]!.actual).toBe(20_000_000);
    expect(layers[4]!.required_min).toBeCloseTo(29_120_000, 0); // 0.65 × 44.8M
  });

  it('interest counts toward AOP but not Identification', () => {
    const pursuits: Pursuit[] = [
      { stage: 'interest', value: 100_000_000 },
      { stage: 'qualified', value: 50_000_000 },
    ];

    const layers = computeLayers(AOP, pursuits);

    expect(layers[0]!.actual).toBe(150_000_000); // AOP includes interest
    expect(layers[1]!.actual).toBe(50_000_000); // Identification excludes interest
  });

  it('qualify staging is excluded from every layer, including AOP', () => {
    const pursuits: Pursuit[] = [
      { stage: 'qualify', value: 100_000_000 }, // pre-pipeline staging — not counted
      { stage: 'qualified', value: 50_000_000 },
    ];

    const layers = computeLayers(AOP, pursuits);

    expect(layers[0]!.actual).toBe(50_000_000); // AOP excludes qualify staging
    expect(layers[1]!.actual).toBe(50_000_000);
  });

  it('Required scales linearly with the AOP target', () => {
    const doubled = computeLayers(AOP * 2, []);
    expect(doubled[0]!.required_min).toBe(AOP * 2 * 10);
    expect(doubled[4]!.required_min).toBeCloseTo(AOP * 2 * 0.65, 0);
  });

  it('empty pipeline yields zero actuals and red status', () => {
    const layers = computeLayers(AOP, []);
    for (const layer of layers) {
      expect(layer.actual).toBe(0);
      expect(layer.status).toBe('red');
    }
  });

  it('multiple is the fixed layer multiplier; coverage tracks actual ÷ required', () => {
    const pursuits: Pursuit[] = [
      { stage: 'pursue', value: 112_000_000 }, // exactly Pursuit Required (2.5 × 44.8M)
    ];
    const layers = computeLayers(AOP, pursuits);

    // multiple always echoes the configured multiplier, regardless of actuals
    expect(layers[0]!.multiple).toBe(10);
    expect(layers[1]!.multiple).toBe(5);
    expect(layers[2]!.multiple).toBe(2.5);
    expect(layers[3]!.multiple).toBe(1.25);
    expect(layers[4]!.multiple).toBe(0.65);

    // Pursuit actual == its Required → coverage 1.0×
    expect(layers[2]!.coverage).toBe(1);
    // AOP Required is 448M; 112M covered → 0.25×
    expect(layers[0]!.coverage).toBe(0.25);
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

  it('excludes $1 IDIQ placeholder and $0 values from all layer sums', () => {
    const pursuits: Pursuit[] = [
      { stage: 'qualified', value: 1 }, // $1 IDIQ — excluded
      { stage: 'qualified', value: 0 }, // $0 — excluded
      { stage: 'pursue', value: 80_000_000 },
    ];

    const layers = computeLayers(AOP, pursuits);

    // AOP + Identification + Pursuit only include the $80M pursue
    expect(layers[0]!.actual).toBe(80_000_000);
    expect(layers[1]!.actual).toBe(80_000_000);
    expect(layers[2]!.actual).toBe(80_000_000);
    // Capture / Proposal have no qualifying stages
    expect(layers[3]!.actual).toBe(0);
    expect(layers[4]!.actual).toBe(0);
  });
});
