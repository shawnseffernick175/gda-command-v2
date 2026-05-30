/**
 * API version switch — F-213 Frontend Cutover to V3.
 *
 * Reads VITE_API_ACTIVE at build time to decide which backend to target.
 * Default: "v3" (cutover). Rollback: redeploy with VITE_API_ACTIVE=v2.
 *
 * In dev mode, both v2 and v3 are proxied through Vite; in prod,
 * the env vars resolve to full URLs at build time.
 */

type ApiVersion = "v2" | "v3";

const ACTIVE_VERSION: ApiVersion =
  (import.meta.env.VITE_API_ACTIVE as ApiVersion | undefined) === "v2"
    ? "v2"
    : "v3";

const BASE_V2 = import.meta.env.VITE_API_BASE_V2 ?? "/api";
const BASE_V3 = import.meta.env.VITE_API_BASE_V3 ?? "/api";

/** The API base path used by all fetch calls. */
export const API_BASE: string = ACTIVE_VERSION === "v3" ? BASE_V3 : BASE_V2;

/** The auth base path (always same origin). */
export const AUTH_BASE: string = `${API_BASE}/auth`;

/** Which backend version the frontend is wired to — exposed for Sentinel / soak metrics. */
export const API_VERSION: ApiVersion = ACTIVE_VERSION;
