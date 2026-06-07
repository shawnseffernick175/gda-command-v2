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

export async function detectAndLinkVehicles(opportunityId: number): Promise<void> {
  try {
    const oppResult = await pool.query<{ title: string; description: string | null }>(
      `SELECT title, COALESCE(description, '') as description FROM opportunities WHERE id = $1`,
      [opportunityId],
    );
    if (oppResult.rows.length === 0) return;
    const { title, description } = oppResult.rows[0];
    const searchText = `${title} ${description}`.toUpperCase();

    const vehicleResult = await pool.query<Vehicle>(
      `SELECT id, short_name, contract_number, name FROM contract_vehicles WHERE is_active = true`,
    );

    for (const vehicle of vehicleResult.rows) {
      let matchType: string | null = null;
      let evidence: string | null = null;

      // Check contract number first (strongest signal)
      if (vehicle.contract_number && searchText.includes(vehicle.contract_number.toUpperCase())) {
        matchType = 'contract_number';
        evidence = `Contract number ${vehicle.contract_number} found in text`;
      }
      // Check short name
      else if (searchText.includes(vehicle.short_name.toUpperCase())) {
        matchType = 'keyword';
        evidence = `Vehicle short name "${vehicle.short_name}" found in text`;
      }
      // Check full name keywords (2+ words that must appear together)
      else {
        const nameWords = vehicle.name.toUpperCase().split(' ').filter(w => w.length > 4);
        const matchCount = nameWords.filter(w => searchText.includes(w)).length;
        if (matchCount >= 2) {
          matchType = 'keyword';
          evidence = `Vehicle name keywords (${matchCount}/${nameWords.length}) found in text`;
        }
      }

      if (matchType) {
        await pool.query(
          `INSERT INTO opportunity_vehicle_links (opportunity_id, vehicle_id, match_type, match_evidence)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (opportunity_id, vehicle_id) DO NOTHING`,
          [opportunityId, vehicle.id, matchType, evidence],
        );
      }
    }
  } catch (err) {
    logger.warn({ err, opportunityId }, '[vehicle-detector] Failed to detect vehicles');
  }
}

/** Run detection on all existing opportunities in batches */
export async function backfillVehicleDetection(): Promise<{ linked: number }> {
  const result = await pool.query<{ id: number }>(
    `SELECT id FROM opportunities WHERE deleted_at IS NULL ORDER BY id`,
  );
  let linked = 0;
  for (const row of result.rows) {
    await detectAndLinkVehicles(row.id);
    linked++;
  }
  return { linked };
}
