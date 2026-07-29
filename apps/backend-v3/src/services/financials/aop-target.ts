/**
 * Canonical AOP target — single source of truth (Batch B).
 *
 * The Annual Operating Plan revenue target must read identically everywhere it
 * appears (Financial Bible AOP plan/execution, Pipeline Coverage multiples,
 * dashboards). Before this service the value lived in TWO unlinked stores:
 *
 *   • Financial Bible  → `financial_plan` monthly rows (source='user_aop')
 *   • Pipeline Coverage → `wheelhouse_config.aop_revenue_target_fyXX`
 *
 * They never synced, so an edit in one surface silently disagreed with the
 * other (prod: FY26 was $34.0M in the Bible vs $44.8M in Pipeline).
 *
 * Canonical model:
 *   - The editable source of truth is the set of 12 monthly `financial_plan`
 *     rows (source='user_aop'). The annual AOP is the SUM of their `plan_sales`.
 *     Any single month can be adjusted; the annual is always their sum.
 *   - `wheelhouse_config.aop_revenue_target_fyXX` is a denormalized MIRROR that
 *     is always re-derived from that monthly sum inside the same transaction as
 *     any AOP write (`syncAopTargetMirror`). Pipeline keeps reading the mirror
 *     column, so its number can never drift from the Bible's.
 *
 * Every AOP write — from the Bible (annual save or per-month adjust) or from
 * Pipeline — funnels through the helpers here so both surfaces stay identical.
 */

import type pg from 'pg';
import { getMonthsForMode } from '../../lib/fiscal-calendar.js';

/** FY → the wheelhouse_config mirror column holding the annual AOP revenue. */
export const AOP_TARGET_COLUMN: Record<number, string> = {
  2026: 'aop_revenue_target_fy26',
  2027: 'aop_revenue_target_fy27',
  2028: 'aop_revenue_target_fy28',
};

/** Fiscal years that have a canonical mirror column. */
export const AOP_TARGET_FYS = Object.keys(AOP_TARGET_COLUMN).map(Number);

export function isSupportedAopFy(fy: number): boolean {
  return Object.prototype.hasOwnProperty.call(AOP_TARGET_COLUMN, fy);
}

type Exec = pg.Pool | pg.PoolClient;

/**
 * Re-derive `wheelhouse_config.aop_revenue_target_fyXX` from the sum of the
 * fiscal year's monthly `user_aop` plan_sales rows and persist it. This is the
 * ONLY writer of the mirror column, and it must run in the same transaction as
 * whatever changed the monthly rows so the mirror can never lag.
 *
 * Returns the newly-synced annual value, or `null` when the FY has no mirror
 * column (never zeroes an unmanaged FY).
 */
export async function syncAopTargetMirror(
  exec: Exec,
  fiscalYear: number,
): Promise<number | null> {
  const col = AOP_TARGET_COLUMN[fiscalYear];
  if (!col) return null;

  const { rows } = await exec.query<{ annual: string | null }>(
    `SELECT SUM(plan_sales) AS annual
       FROM financial_plan
      WHERE source = 'user_aop' AND is_seed = false
        AND fiscal_year = $1 AND period NOT LIKE '%Q%'`,
    [fiscalYear],
  );

  const annual = rows[0]?.annual != null ? Number(rows[0].annual) : null;
  // No monthly rows for this FY → leave the mirror untouched (its seeded value
  // is still the authoritative target until the owner enters a monthly plan).
  if (annual == null) return null;

  await exec.query(
    `UPDATE wheelhouse_config SET ${col} = $1, updated_at = now() WHERE id = 1`,
    [annual],
  );
  return annual;
}

/**
 * Distribute an annual AOP revenue figure evenly (annual ÷ 12) across the 12
 * monthly `user_aop` rows for a fiscal year, writing ONLY `plan_sales`.
 * Existing rows keep their other metrics (orders/EBIT/margins); missing rows
 * are created with plan_sales set and other metrics null. Used by the Pipeline
 * write path, where the owner is setting the revenue target only.
 *
 * Must be called inside a transaction; the caller is responsible for
 * `syncAopTargetMirror` afterwards.
 */
export async function distributeAnnualSales(
  exec: Exec,
  fiscalYear: number,
  annualSales: number,
): Promise<void> {
  const fyShort = `FY${fiscalYear % 100}`;
  const monthSales = annualSales / 12;
  // CY quarters (ceil(month/3)) — matches the Bible AOP-plan write convention.
  for (const { mon, quarter } of getMonthsForMode('CY')) {
    const period = `${fyShort} ${mon}`;
    const upd = await exec.query(
      `UPDATE financial_plan
          SET plan_sales = $1
        WHERE source = 'user_aop' AND is_seed = false
          AND fiscal_year = $2 AND period = $3`,
      [monthSales, fiscalYear, period],
    );
    if (upd.rowCount === 0) {
      await exec.query(
        `INSERT INTO financial_plan
           (period, fiscal_year, quarter, plan_sales, is_seed, source)
         VALUES ($1, $2, $3, $4, false, 'user_aop')`,
        [period, fiscalYear, quarter, monthSales],
      );
    }
  }
}
