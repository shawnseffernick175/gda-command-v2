import { pool } from '../../lib/db.js';

export type RiskEventType =
  | 'created'
  | 'duplicate_fire'
  | 'status_change'
  | 'severity_change'
  | 'owner_assigned'
  | 'mitigation_updated'
  | 'evidence_added'
  | 'auto_archived';

export async function createRiskEvent(
  riskId: number,
  eventType: RiskEventType,
  payload: Record<string, unknown>,
  actor: string = 'system',
): Promise<void> {
  await pool.query(
    `INSERT INTO risk_events (risk_id, event_type, payload, actor)
     VALUES ($1, $2, $3, $4)`,
    [riskId, eventType, JSON.stringify(payload), actor],
  );
}

export async function getRiskEvents(
  riskId: number,
  limit: number = 50,
): Promise<unknown[]> {
  const { rows } = await pool.query(
    `SELECT * FROM risk_events WHERE risk_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [riskId, limit],
  );
  return rows;
}
