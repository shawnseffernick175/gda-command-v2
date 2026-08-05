/**
 * The `/opportunities/[id]` route is prerendered from a single build-time
 * placeholder param under static export, so on the SPA fallback `useParams()`
 * can hand back the sentinel `__placeholder__` instead of the real path segment.
 * Resolve the id from the actual URL path first and only fall back to the
 * (non-placeholder) param, so a hard-load of `/opportunities/<id>` fetches the
 * real opportunity rather than `__placeholder__`.
 */
export const PLACEHOLDER_OPPORTUNITY_ID = "__placeholder__";

export function idFromPathname(pathname: string | null | undefined): string | undefined {
  const seg = pathname?.match(/\/opportunities\/([^/?#]+)/)?.[1];
  if (!seg) return undefined;
  const decoded = decodeURIComponent(seg);
  return decoded === PLACEHOLDER_OPPORTUNITY_ID ? undefined : decoded;
}

export function resolveOpportunityId(
  pathname: string | null | undefined,
  param: string | string[] | null | undefined,
): string | undefined {
  const raw = Array.isArray(param) ? param[0] : param;
  const cleanParam = raw && raw !== PLACEHOLDER_OPPORTUNITY_ID ? raw : undefined;
  return idFromPathname(pathname) ?? cleanParam;
}
