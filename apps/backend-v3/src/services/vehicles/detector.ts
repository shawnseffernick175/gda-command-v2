/**
 * Vehicle Detector
 * Scans opportunity title + description for keywords matching known IDIQ vehicles.
 * Runs after SAM ingest, tags matches into opportunity_vehicle_links.
 */
import { pool } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';

interface Vehicle {
  id: number;
  short_name: string;
  contract_number: string | null;
  name: string;
}

/** Common procurement words excluded from name-keyword matching */
const STOP_WORDS = new Set([
  'SMALL', 'BUSINESS', 'SERVICES', 'SERVICE', 'STRATEGIC', 'AWARD',
  'SCHEDULE', 'MULTIPLE', 'FEDERAL', 'GOVERNMENT', 'CONTRACT',
  'SUPPORT', 'PROGRAM', 'MANAGEMENT', 'INFORMATION', 'TECHNOLOGY',
  'SYSTEMS', 'SOLUTIONS', 'GENERAL', 'NATIONAL', 'AGENCY',
]);

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Word-boundary match (case-insensitive against already-uppercased text) */
function hasWordBoundaryMatch(text: string, term: string): boolean {
  const pattern = new RegExp(`\\b${escapeRegex(term.toUpperCase())}\\b`);
  return pattern.test(text);
}

export async function detectAndLinkVehicles(opportunityId: number): Promise<number> {
  try {
    const oppResult = await pool.query<{ title: string; description: string | null }>(
      `SELECT title, COALESCE(description, '') as description FROM opportunities WHERE id = $1`,
      [opportunityId],
    );
    if (oppResult.rows.length === 0) return 0;
    const { title, description } = oppResult.rows[0];
    const searchText = `${title} ${description}`.toUpperCase();

    const vehicleResult = await pool.query<Vehicle>(
      `SELECT id, short_name, contract_number, name FROM contract_vehicles WHERE is_active = true`,
    );

    let linksCreated = 0;

    for (const vehicle of vehicleResult.rows) {
      let matchType: string | null = null;
      let evidence: string | null = null;

      // Check contract number first (strongest signal)
      if (vehicle.contract_number && searchText.includes(vehicle.contract_number.toUpperCase())) {
        matchType = 'contract_number';
        evidence = `Contract number ${vehicle.contract_number} found in text`;
      }
      // Check short name with word-boundary matching to avoid substring false positives
      else if (hasWordBoundaryMatch(searchText, vehicle.short_name)) {
        matchType = 'keyword';
        evidence = `Vehicle short name "${vehicle.short_name}" found in text`;
      }
      // Check full name keywords — filter stop words and require ≥60% match
      else {
        const nameWords = vehicle.name.toUpperCase().split(' ')
          .filter(w => w.length > 4 && !STOP_WORDS.has(w));
        if (nameWords.length >= 2) {
          const matchCount = nameWords.filter(w => hasWordBoundaryMatch(searchText, w)).length;
          const threshold = Math.ceil(nameWords.length * 0.6);
          if (matchCount >= threshold) {
            matchType = 'keyword';
            evidence = `Vehicle name keywords (${matchCount}/${nameWords.length}) found in text`;
          }
        }
      }

      if (matchType) {
        const insertResult = await pool.query(
          `INSERT INTO opportunity_vehicle_links (opportunity_id, vehicle_id, match_type, match_evidence)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (opportunity_id, vehicle_id) DO NOTHING`,
          [opportunityId, vehicle.id, matchType, evidence],
        );
        if (insertResult.rowCount && insertResult.rowCount > 0) {
          linksCreated++;
        }
      }
    }

    return linksCreated;
  } catch (err) {
    logger.warn({ err, opportunityId }, '[vehicle-detector] Failed to detect vehicles');
    return 0;
  }
}

const BATCH_SIZE = 500;

/** Run detection on all existing opportunities with cursor-based batching */
export async function backfillVehicleDetection(): Promise<{ scanned: number; linked: number }> {
  let scanned = 0;
  let linked = 0;
  let lastId = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const batch = await pool.query<{ id: number }>(
      `SELECT id FROM opportunities WHERE deleted_at IS NULL AND id > $1 ORDER BY id LIMIT $2`,
      [lastId, BATCH_SIZE],
    );
    if (batch.rows.length === 0) break;

    for (const row of batch.rows) {
      const count = await detectAndLinkVehicles(row.id);
      linked += count;
      scanned++;
      lastId = row.id;
    }
  }

  return { scanned, linked };
}
