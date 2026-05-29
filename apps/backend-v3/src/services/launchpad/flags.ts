import { pool } from '../../lib/db.js';

export type FlagSeverity = 'critical' | 'warning' | 'info';

export interface SourceCitation {
  kind: string;
  title: string;
  url: string;
  retrieved_at: string;
}

export interface LaunchpadFlag {
  id: string;
  flag_key: string;
  severity: FlagSeverity;
  title: string;
  detail: string | null;
  due_date: string | null;
  doctrine_anchor: string | null;
  source_url: string | null;
  source_url_sources: SourceCitation[];
  created_at: string;
}

interface FlagRow {
  id: string;
  flag_type: string;
  severity: string;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  doctrine_anchor: string | null;
  source_url: string | null;
  created_at: string;
  source_kind: string | null;
  source_title: string | null;
  source_retrieved_at: string | null;
}

export interface LaunchpadFlagsResult {
  flags: LaunchpadFlag[];
  compliance_gaps: number;
  compliance_gaps_sources: SourceCitation[];
  teaming_unresolved: number;
  teaming_unresolved_sources: SourceCitation[];
  analysis_timeouts_24h: number;
  analysis_timeouts_24h_sources: SourceCitation[];
}

export async function computeFlags(): Promise<LaunchpadFlagsResult> {
  const [flagsRes, complianceRes, teamingRes, timeoutsRes] = await Promise.all([
    pool.query<FlagRow>(
      `SELECT lf.id::text, lf.flag_type, lf.severity, lf.title,
              lf.body, lf.entity_type, lf.entity_id::text,
              lf.doctrine_anchor, lf.source_url, lf.created_at::text,
              s.kind AS source_kind, s.title AS source_title,
              s.retrieved_at::text AS source_retrieved_at
       FROM launchpad_flags lf
       LEFT JOIN sources s ON s.id = lf.source_id
       WHERE lf.dismissed_at IS NULL
       ORDER BY
         CASE lf.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
         lf.created_at DESC`
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(DISTINCT c.id)::text AS count
       FROM captures c
       WHERE EXISTS (
         SELECT 1 FROM compliance_items ci
         WHERE ci.capture_id = c.id AND ci.status = 'non_compliant'
       )`
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM teaming_attachments ta
       JOIN opportunities o ON o.id = ta.opportunity_id
       WHERE ta.status = 'proposed'
         AND o.status = 'qualified'
         AND o.deleted_at IS NULL`
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM audit_log
       WHERE action = 'analysis_timeout'
         AND created_at > NOW() - INTERVAL '24 hours'`
    ),
  ]);

  const flags: LaunchpadFlag[] = flagsRes.rows.map((row) => ({
    id: row.id,
    flag_key: row.flag_type,
    severity: row.severity as FlagSeverity,
    title: row.title,
    detail: row.body,
    due_date: null,
    doctrine_anchor: row.doctrine_anchor,
    source_url: row.source_url,
    source_url_sources: row.source_kind
      ? [
          {
            kind: row.source_kind,
            title: row.source_title ?? 'Unknown source',
            url: row.source_url ?? '',
            retrieved_at: row.source_retrieved_at ?? new Date().toISOString(),
          },
        ]
      : [],
    created_at: row.created_at,
  }));

  const now = new Date().toISOString();
  const internalSrc = (filterUrl: string, label: string): SourceCitation[] => [
    { kind: 'internal', title: `GDA Command V3 — ${label}`, url: filterUrl, retrieved_at: now },
  ];

  return {
    flags,
    compliance_gaps: parseInt(complianceRes.rows[0]?.count ?? '0', 10),
    compliance_gaps_sources: internalSrc('/v3/captures?compliance=non_compliant', 'compliance gaps count'),
    teaming_unresolved: parseInt(teamingRes.rows[0]?.count ?? '0', 10),
    teaming_unresolved_sources: internalSrc('/v3/opportunities?teaming=unresolved&status=qualified', 'teaming unresolved count'),
    analysis_timeouts_24h: parseInt(timeoutsRes.rows[0]?.count ?? '0', 10),
    analysis_timeouts_24h_sources: internalSrc('/v3/metrics?filter=analysis_timeout_24h', 'analysis timeouts count'),
  };
}
