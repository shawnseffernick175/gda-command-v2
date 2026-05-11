import React from "react";

const SOURCE_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  "sam.gov": { bg: "rgba(14,165,233,0.15)", color: "#0ea5e9", label: "SAM.GOV" },
  fpds: { bg: "rgba(234,88,12,0.15)", color: "#ea580c", label: "FPDS" },
  govwin: { bg: "rgba(168,85,247,0.15)", color: "#a855f7", label: "GOVWIN" },
  govtribe: { bg: "rgba(16,185,129,0.15)", color: "#10b981", label: "GOVTRIBE" },
  usaspending: { bg: "rgba(245,158,11,0.15)", color: "#f59e0b", label: "USASPENDING" },
  manual: { bg: "rgba(107,114,128,0.15)", color: "#6b7280", label: "MANUAL" },
};

const DEFAULT_STYLE = { bg: "rgba(107,114,128,0.15)", color: "#6b7280" };

interface SourceBadgeProps {
  source: string | null | undefined;
  hideManual?: boolean;
  size?: "sm" | "md";
}

export default function SourceBadge({ source, hideManual = true, size = "sm" }: SourceBadgeProps) {
  if (!source) return null;
  if (hideManual && source === "manual") return null;

  const s = SOURCE_STYLES[source] ?? { ...DEFAULT_STYLE, label: source.toUpperCase() };
  const fontSize = size === "sm" ? 9 : 10;
  const padding = size === "sm" ? "1px 5px" : "2px 7px";

  return (
    <span
      style={{
        fontSize,
        fontWeight: 700,
        padding,
        borderRadius: 4,
        flexShrink: 0,
        textTransform: "uppercase",
        letterSpacing: "0.5px",
        background: s.bg,
        color: s.color,
        whiteSpace: "nowrap",
      }}
      title={`Source: ${source}`}
    >
      {s.label}
    </span>
  );
}
