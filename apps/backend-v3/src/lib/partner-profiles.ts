/* ── Partner Profiles — shared constants and pure helpers ─────────── */

export interface CapabilitySummaryItem {
  area: string;
  detail: string;
  evidence_doc_id: string | null;
}

export interface PastPerformanceItem {
  agency: string;
  contract_id: string | null;
  value: number | null;
  period: string;
  evidence_doc_id: string | null;
}

export interface KeyPersonnelItem {
  name: string;
  clearance: string;
  certifications: string[];
}

export interface PartnerProfileRow {
  ou: string;
  name: string;
  owner: string;
  overview: string;
  agencies_of_strength: string[];
  naics_codes: string[];
  capabilities_summary: CapabilitySummaryItem[];
  past_performance_summary: PastPerformanceItem[];
  key_personnel: KeyPersonnelItem[];
  certifications: string[];
  active: boolean;
  last_reviewed_at: string;
}

export interface TeamingFitResult {
  ou: string;
  partner_name: string;
  fit_score: number;
  reasons: string[];
  cited_evidence: Array<{
    kind: string;
    detail: string;
    source: string;
  }>;
}

export interface SourceCitation {
  kind: string;
  title: string;
  url: string;
  retrieved_at: string;
}

export const VALID_OUS = new Set(['riverstone', 'pd_systems']);

export const PARTNER_DISPLAY_NAMES: Record<string, string> = {
  riverstone: 'Riverstone Solutions',
  pd_systems: 'PD Systems',
};

export const SAM_SOURCE: SourceCitation = {
  kind: 'sam_gov',
  title: 'SAM.gov Entity Registry',
  url: 'https://sam.gov',
  retrieved_at: '2026-05-29T06:00:00.000Z',
};

export const OU_OWNERS: Record<string, string> = {
  pd_systems: '00000000-0000-0000-0000-000000000001',
  riverstone: '00000000-0000-0000-0000-000000000002',
};

export const ALLOWED_PATCH_FIELDS = [
  'overview', 'agencies_of_strength', 'naics_codes',
  'capabilities_summary', 'past_performance_summary',
  'key_personnel', 'certifications',
] as const;

export function isStale(lastReviewedAt: string): boolean {
  const reviewed = new Date(lastReviewedAt);
  const now = new Date();
  const diffDays = (now.getTime() - reviewed.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays > 90;
}

export function isValidOu(ou: string): boolean {
  return VALID_OUS.has(ou);
}

export function isOuOwner(ou: string, userId: string): boolean {
  return OU_OWNERS[ou] === userId;
}

export function toListItem(r: PartnerProfileRow) {
  return {
    id: r.ou,
    ou: r.ou,
    display_name: r.name,
    name: r.name,
    anchor_company: r.name,
    overview: r.overview,
    capabilities: (r.capabilities_summary as CapabilitySummaryItem[]).map((c) => c.area),
    capabilities_summary: r.capabilities_summary,
    certifications: (r.certifications as string[]).map((c) => ({ name: c, status: 'active' as const, expiration_date: null })),
    agencies_of_strength: r.agencies_of_strength,
    naics_codes: r.naics_codes,
    last_reviewed_at: r.last_reviewed_at,
    is_stale: isStale(r.last_reviewed_at),
  };
}

export function toDetailView(profile: PartnerProfileRow) {
  const capFlat = (profile.capabilities_summary as CapabilitySummaryItem[]).map((c) => c.area);
  const certObjects = (profile.certifications as string[]).map((c) => ({ name: c, status: 'active' as const, expiration_date: null }));
  const ppText = (profile.past_performance_summary as PastPerformanceItem[])
    .map((pp) => `${pp.agency}${pp.contract_id ? ` (${pp.contract_id})` : ''} — ${pp.period}`)
    .join('; ') || 'No past performance data';

  return {
    id: profile.ou,
    ou: profile.ou,
    display_name: profile.name,
    name: profile.name,
    owner: profile.owner,
    anchor_company: profile.name,
    anchor_company_sources: [SAM_SOURCE],
    uei: null,
    uei_sources: [] as SourceCitation[],
    cage: null,
    cage_sources: [] as SourceCitation[],
    primary_naics: profile.naics_codes[0] ?? null,
    primary_naics_sources: [SAM_SOURCE],
    overview: profile.overview,
    capabilities: capFlat,
    capabilities_sources: [SAM_SOURCE],
    capabilities_summary: profile.capabilities_summary,
    certifications: certObjects,
    certifications_sources: [SAM_SOURCE],
    vehicles: [] as unknown[],
    vehicles_sources: [] as SourceCitation[],
    past_performance_summary: ppText,
    past_performance_summary_sources: [SAM_SOURCE],
    past_performance_detail: profile.past_performance_summary,
    recent_awards: [] as unknown[],
    recent_awards_sources: [] as SourceCitation[],
    teaming_history: [] as unknown[],
    teaming_history_sources: [] as SourceCitation[],
    agencies_of_strength: profile.agencies_of_strength,
    naics_codes: profile.naics_codes,
    key_personnel: profile.key_personnel,
    active: profile.active,
    last_reviewed_at: profile.last_reviewed_at,
    is_stale: isStale(profile.last_reviewed_at),
  };
}

export function computeTeamingFitScore(
  partner: PartnerProfileRow,
  opp: {
    agency: string | null;
    naics: string | null;
    set_aside: string | null;
    title: string | null;
    description: string | null;
  },
): TeamingFitResult {
  const reasons: string[] = [];
  const cited_evidence: TeamingFitResult['cited_evidence'] = [];
  let score = 0;

  if (opp.agency) {
    const agencyUpper = opp.agency.toUpperCase();
    const matchedAgency = partner.agencies_of_strength.find(
      (a) => agencyUpper.includes(a.toUpperCase()) || a.toUpperCase().includes(agencyUpper)
    );
    if (matchedAgency) {
      score += 30;
      reasons.push(`${partner.name} has strength at ${matchedAgency} — matches opportunity agency`);
      cited_evidence.push({ kind: 'agency_match', detail: `Agency of strength: ${matchedAgency}`, source: 'partner_profile' });
    }
  }

  if (opp.naics) {
    const oppNaics = opp.naics.replace(/[^0-9]/g, '').slice(0, 6);
    const matchedNaics = partner.naics_codes.find((n) => n.startsWith(oppNaics.slice(0, 4)) || oppNaics.startsWith(n.slice(0, 4)));
    if (matchedNaics) {
      score += 20;
      reasons.push(`NAICS ${matchedNaics} aligns with opportunity NAICS ${opp.naics}`);
      cited_evidence.push({ kind: 'naics_match', detail: `Partner NAICS: ${matchedNaics}, Opp NAICS: ${opp.naics}`, source: 'partner_profile' });
    }
  }

  if (opp.set_aside) {
    const setAsideUpper = opp.set_aside.toUpperCase();
    const matchedCert = partner.certifications.find((c) => setAsideUpper.includes(c.toUpperCase()));
    if (matchedCert) {
      score += 25;
      reasons.push(`${partner.name} (${matchedCert} certified) unlocks ${opp.set_aside} set-aside`);
      cited_evidence.push({ kind: 'cert_unlock', detail: `Certification: ${matchedCert} matches set-aside: ${opp.set_aside}`, source: 'partner_profile' });
    }
  }

  if (opp.description || opp.title) {
    const text = `${opp.title ?? ''} ${opp.description ?? ''}`.toLowerCase();
    const capabilities = partner.capabilities_summary as CapabilitySummaryItem[];
    for (const cap of capabilities) {
      const keywords = cap.area.toLowerCase().split(/[\s/]+/);
      const matched = keywords.some((kw) => kw.length > 3 && text.includes(kw));
      if (matched) {
        score += 10;
        reasons.push(`Scope overlap: ${cap.area} — ${cap.detail}`);
        cited_evidence.push({ kind: 'capability_match', detail: cap.area, source: 'partner_profile' });
      }
    }
  }

  const ppSummary = partner.past_performance_summary as PastPerformanceItem[];
  if (opp.agency) {
    const agencyUp = opp.agency.toUpperCase();
    const ppMatch = ppSummary.find((pp) => agencyUp.includes(pp.agency.toUpperCase()));
    if (ppMatch) {
      score += 15;
      reasons.push(`Past performance at ${ppMatch.agency}${ppMatch.contract_id ? ` (${ppMatch.contract_id})` : ''}`);
      cited_evidence.push({
        kind: 'past_performance',
        detail: `${ppMatch.agency} ${ppMatch.period}${ppMatch.contract_id ? ` — ${ppMatch.contract_id}` : ''}`,
        source: 'partner_profile',
      });
    }
  }

  const fitScore = Math.min(score, 100);

  if (reasons.length === 0) {
    reasons.push('No significant alignment found between this opportunity and partner capabilities');
  }

  return {
    ou: partner.ou,
    partner_name: partner.name,
    fit_score: fitScore,
    reasons,
    cited_evidence,
  };
}
