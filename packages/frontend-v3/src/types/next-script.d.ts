/**
 * Type override for next/script — React 19 JSX type incompatibility
 * with the Script component's function signature.
 */
declare module "next/script" {
  import type { ScriptHTMLAttributes } from "react";

  export interface ScriptProps extends ScriptHTMLAttributes<HTMLScriptElement> {
    strategy?: "afterInteractive" | "lazyOnload" | "beforeInteractive" | "worker";
    id?: string;
    onLoad?: (e: unknown) => void;
    onReady?: () => void | null;
    onError?: (e: unknown) => void;
    children?: React.ReactNode;
    stylesheets?: string[];
  }

  declare const Script: React.FC<ScriptProps>;
  export default Script;
}
