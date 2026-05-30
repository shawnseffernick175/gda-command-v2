/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "v2" | "v3" — which backend the frontend targets. Default "v3". */
  readonly VITE_API_ACTIVE?: string;
  /** Base URL for the V2 API (default "/api"). */
  readonly VITE_API_BASE_V2?: string;
  /** Base URL for the V3 API (default "/api"). */
  readonly VITE_API_BASE_V3?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
