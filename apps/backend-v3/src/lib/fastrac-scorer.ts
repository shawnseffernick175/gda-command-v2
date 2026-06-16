/**
 * FasTrac bidirectional scorer — computes match scores + evidence
 * between a need signal and a solution signal.
 *
 * Reuses the scoring dimensions already in fast_track_matches
 * (mission_fit, technical_fit, timing) but now returns an evidence
 * block alongside each score for full traceability.
 */

export interface SignalForScoring {
  id: string;
  pipeline: 'tech' | 'requirement';
  title: string;
  source: string;
  mission_tags: string[];
  problem_tags: string[];
  horizon: string;
  signal_strength: number;
  maturity: string | null;
  urgency: string | null;
  source_url: string | null;
  institution_name: string | null;
  published_at: string | null;
  transition_tags: string[];
}

export interface MatchEvidence {
  mission_tag_overlap: string[];
  mission_tag_unmatched: string[];
  timing_window_alignment: {
    need: string;
    solution: string;
    score: number;
  };
  source_history: {
    partnerships: number;
    prior_collaborations: string[];
  } | null;
  pursuit_reasoning: string;
  adoption_reasoning: string;
}

export interface ScoredMatch {
  need_signal_id: string;
  solution_signal_id: string;
  need_title: string;
  need_source: string;
  need_source_url: string | null;
  need_mission_tags: string[];
  solution_title: string;
  solution_source: string;
  solution_source_url: string | null;
  solution_mission_tags: string[];
  mission_fit_score: number;
  technical_fit_score: number;
  timing_score: number;
  overall_score: number;
  adoption_path: string | null;
  recommended_vehicle: string | null;
  evidence: MatchEvidence;
}

const HORIZON_ORDER: Record<string, number> = {
  '0-6mo': 0,
  '6-12mo': 1,
  '12-24mo': 2,
};

function horizonDistance(a: string, b: string): number {
  const ai = HORIZON_ORDER[a] ?? 1;
  const bi = HORIZON_ORDER[b] ?? 1;
  return Math.abs(ai - bi);
}

function computeTimingScore(needHorizon: string, solutionHorizon: string): number {
  const dist = horizonDistance(needHorizon, solutionHorizon);
  if (dist === 0) return 1.0;
  if (dist === 1) return 0.75;
  return 0.5;
}

function computeMissionFit(
  needTags: string[],
  solutionTags: string[],
): { score: number; overlap: string[]; unmatched: string[] } {
  const needSet = new Set(needTags.map(t => t.toLowerCase()));
  const solSet = new Set(solutionTags.map(t => t.toLowerCase()));

  const overlap: string[] = [];
  for (const tag of needSet) {
    if (solSet.has(tag)) overlap.push(tag);
  }

  const unmatched: string[] = [];
  for (const tag of needSet) {
    if (!solSet.has(tag)) unmatched.push(tag);
  }
  for (const tag of solSet) {
    if (!needSet.has(tag)) unmatched.push(tag);
  }

  if (needSet.size === 0 && solSet.size === 0) {
    return { score: 0.5, overlap, unmatched };
  }

  const unionSize = new Set([...needSet, ...solSet]).size;
  const score = unionSize > 0 ? overlap.length / unionSize : 0;

  return { score: Math.min(score * 1.2, 1.0), overlap, unmatched };
}

function computeTechnicalFit(
  needProblems: string[],
  solutionProblems: string[],
  needTransitions: string[],
  solutionTransitions: string[],
): number {
  const needSet = new Set(needProblems.map(t => t.toLowerCase()));
  const solSet = new Set(solutionProblems.map(t => t.toLowerCase()));

  let problemOverlap = 0;
  for (const tag of needSet) {
    if (solSet.has(tag)) problemOverlap++;
  }
  const problemUnion = new Set([...needSet, ...solSet]).size;
  const problemScore = problemUnion > 0 ? problemOverlap / problemUnion : 0.5;

  const transNeed = new Set(needTransitions.map(t => t.toLowerCase()));
  const transSol = new Set(solutionTransitions.map(t => t.toLowerCase()));
  let transOverlap = 0;
  for (const tag of transNeed) {
    if (transSol.has(tag)) transOverlap++;
  }
  const transUnion = new Set([...transNeed, ...transSol]).size;
  const transScore = transUnion > 0 ? transOverlap / transUnion : 0.5;

  return Math.min((problemScore * 0.7 + transScore * 0.3) * 1.15, 1.0);
}

function inferAdoptionPath(
  need: SignalForScoring,
  solution: SignalForScoring,
): string {
  const transitions = [...need.transition_tags, ...solution.transition_tags]
    .map(t => t.toLowerCase());

  if (transitions.includes('ot')) {
    return 'Partner with PRIME as AI analytics sub — leverage GDA Command pipeline';
  }
  if (transitions.includes('sbir/sttr')) {
    return 'SBIR/STTR Phase alignment — position as technology transition partner';
  }
  if (transitions.includes('cso')) {
    return 'Commercial Solutions Opening — direct proposal with Envision as lead integrator';
  }
  if (transitions.includes('direct')) {
    return 'Direct contract — Envision as prime contractor leveraging GDA Command analytics';
  }
  if (transitions.includes('subcontract') || transitions.includes('partner vehicle')) {
    return 'Subcontract positioning — identify prime and propose as specialized sub';
  }
  return 'Evaluate optimal contracting vehicle based on requirement maturity';
}

function inferVehicle(
  need: SignalForScoring,
  solution: SignalForScoring,
): string {
  const transitions = [...need.transition_tags, ...solution.transition_tags]
    .map(t => t.toLowerCase());

  if (transitions.includes('ot')) return 'OT Agreement via relevant OTA consortium';
  if (transitions.includes('cso')) return 'Commercial Solutions Opening';
  if (transitions.includes('sbir/sttr')) return 'SBIR/STTR program';
  if (transitions.includes('bpa')) return 'Blanket Purchase Agreement';
  if (transitions.includes('crada')) return 'CRADA';
  if (transitions.includes('direct')) return 'Direct contract award';
  return 'To be determined based on procurement timeline';
}

function buildPursuitReasoning(
  need: SignalForScoring,
  solution: SignalForScoring,
  timingScore: number,
): string {
  const parts: string[] = [];

  if (need.urgency === 'critical' || need.urgency === 'high') {
    parts.push(`Need urgency is ${need.urgency}`);
  }
  if (solution.maturity === 'prototype' || solution.maturity === 'pilot') {
    parts.push(`solution is at ${solution.maturity} stage`);
  } else if (solution.maturity === 'concept') {
    parts.push('solution is at concept stage');
  }

  if (timingScore >= 0.9) {
    parts.push('timing windows align perfectly');
  } else if (timingScore >= 0.7) {
    parts.push('timing windows are within one horizon step');
  }

  const transitions = [...need.transition_tags, ...solution.transition_tags];
  if (transitions.some(t => t.toLowerCase() === 'ot')) {
    parts.push('OT pathway available for rapid prototyping');
  }

  if (parts.length === 0) {
    return 'Standard procurement pathway recommended based on available signals.';
  }

  return parts.join('; ') + ' — recommended vehicle offers fastest path to capability demonstration.';
}

function buildAdoptionReasoning(
  need: SignalForScoring,
  solution: SignalForScoring,
  missionOverlap: string[],
): string {
  const parts: string[] = [];

  if (missionOverlap.length > 0) {
    parts.push(`Mission alignment on ${missionOverlap.join(', ')}`);
  }

  if (solution.institution_name) {
    parts.push(`solution sourced from ${solution.institution_name}`);
  }

  parts.push('Envision positions GDA Command analytics pipeline as differentiator');

  return parts.join('; ') + '.';
}

export function scoreMatch(
  need: SignalForScoring,
  solution: SignalForScoring,
): ScoredMatch {
  const { score: missionFit, overlap, unmatched } = computeMissionFit(
    need.mission_tags,
    solution.mission_tags,
  );

  const technicalFit = computeTechnicalFit(
    need.problem_tags,
    solution.problem_tags,
    need.transition_tags,
    solution.transition_tags,
  );

  const timingScore = computeTimingScore(need.horizon, solution.horizon);

  const overall = (missionFit + technicalFit + timingScore) / 3;

  const adoptionPath = inferAdoptionPath(need, solution);
  const vehicle = inferVehicle(need, solution);

  const evidence: MatchEvidence = {
    mission_tag_overlap: overlap,
    mission_tag_unmatched: unmatched,
    timing_window_alignment: {
      need: need.horizon,
      solution: solution.horizon,
      score: timingScore,
    },
    source_history: null,
    pursuit_reasoning: buildPursuitReasoning(need, solution, timingScore),
    adoption_reasoning: buildAdoptionReasoning(need, solution, overlap),
  };

  return {
    need_signal_id: need.id,
    solution_signal_id: solution.id,
    need_title: need.title,
    need_source: need.source,
    need_source_url: need.source_url,
    need_mission_tags: need.mission_tags,
    solution_title: solution.title,
    solution_source: solution.source,
    solution_source_url: solution.source_url,
    solution_mission_tags: solution.mission_tags,
    mission_fit_score: Math.round(missionFit * 1000) / 1000,
    technical_fit_score: Math.round(technicalFit * 1000) / 1000,
    timing_score: Math.round(timingScore * 1000) / 1000,
    overall_score: Math.round(overall * 1000) / 1000,
    adoption_path: adoptionPath,
    recommended_vehicle: vehicle,
    evidence,
  };
}

export function rankCandidates(
  anchor: SignalForScoring,
  candidates: SignalForScoring[],
  anchorIsNeed: boolean,
  limit = 5,
): ScoredMatch[] {
  const scored = candidates.map(candidate => {
    const need = anchorIsNeed ? anchor : candidate;
    const solution = anchorIsNeed ? candidate : anchor;
    return scoreMatch(need, solution);
  });

  scored.sort((a, b) => b.overall_score - a.overall_score);
  return scored.slice(0, limit);
}
