/**
 * Small-Business Play Detection — F-616
 *
 * Envision is SMALL only under EMPLOYEE-BASED NAICS size standards.
 * Under REVENUE-based standards Envision now exceeds the cap and is LARGE.
 *
 * SIZE-STANDARD LOGIC (authoritative SBA table):
 *   541715 (R&D Physical/Engineering/Life Sciences) = 1,000 EMPLOYEES
 *     → employee-based → Envision is SMALL.
 *
 * All 15 other Envision NAICS are REVENUE-based and Envision exceeds the
 * cap → Envision is LARGE for those codes.
 *
 * To add more codes later, just append to this Set. No schema change needed.
 *
 * SYNC: Keep in sync with apps/backend-v3/src/constants/envision-naics.ts
 */
export const ENVISION_SMALL_NAICS: ReadonlySet<string> = new Set([
  '541715', // R&D Physical/Engineering/Life Sciences — 1,000 employees (employee-based) → Envision SMALL
]);

/**
 * Small-business set-aside values that qualify an opportunity for the
 * "SB PLAY" highlight. Matched case-insensitively via substring.
 *
 * For now we include only the two core SB set-asides. To add
 * socioeconomic types (SDVOSB, WOSB, HUBZone, 8(a)) later, append
 * the relevant substring to this list — no code change needed.
 *
 * SYNC: Keep in sync with apps/backend-v3/src/constants/envision-naics.ts
 */
export const SB_SET_ASIDE_VALUES: readonly string[] = [
  'Total Small Business Set-Aside (FAR 19.5)',
  'Partial Small Business Set-Aside (FAR 19.5)',
];

/**
 * Returns true when an opportunity qualifies as a "Small-Biz Play":
 *   1. opportunity NAICS is in ENVISION_SMALL_NAICS, AND
 *   2. set_aside matches one of SB_SET_ASIDE_VALUES (case-insensitive contains).
 */
export function isSmallBizPlay(
  naics: string | null | undefined,
  setAside: string | null | undefined,
): boolean {
  if (!naics || !setAside) return false;
  if (!ENVISION_SMALL_NAICS.has(naics)) return false;
  const lower = setAside.toLowerCase();
  return SB_SET_ASIDE_VALUES.some((v) => lower.includes(v.toLowerCase()));
}

/**
 * Build a human-readable tooltip explaining WHY this opportunity was
 * flagged as a Small-Biz Play.
 */
export function sbPlayTooltip(
  naics: string | null | undefined,
  setAside: string | null | undefined,
): string {
  return (
    `SB Play: Envision is SMALL under NAICS ${naics ?? '—'} (employee-based size standard). ` +
    `Set-aside: ${setAside ?? '—'}.`
  );
}
