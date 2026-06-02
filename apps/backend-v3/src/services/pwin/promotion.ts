/**
 * Pure status-recommendation helper — does NOT mutate the DB.
 * Lifecycle promotion (discovery → signal → forecast) is wired separately.
 */

export const FORECAST_PROMOTION_THRESHOLD = 70;

export function recommendStatus(score: number): 'discovery' | 'signal' | 'forecast' {
  if (score >= FORECAST_PROMOTION_THRESHOLD) return 'forecast';
  if (score >= 45) return 'signal';
  return 'discovery';
}
