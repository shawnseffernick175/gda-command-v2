import React, { useState, useRef, useEffect } from "react";

const SOURCE_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  "sam.gov": { bg: "rgba(14,165,233,0.15)", color: "#0ea5e9", label: "SAM.GOV" },
  fpds: { bg: "rgba(234,88,12,0.15)", color: "#ea580c", label: "FPDS" },
  govwin: { bg: "rgba(168,85,247,0.15)", color: "#a855f7", label: "GOVWIN" },
  govtribe: { bg: "rgba(16,185,129,0.15)", color: "#10b981", label: "GOVTRIBE" },
  usaspending: { bg: "rgba(245,158,11,0.15)", color: "#f59e0b", label: "USASPENDING" },
  manual: { bg: "rgba(107,114,128,0.15)", color: "#6b7280", label: "MANUAL" },
};

const DEFAULT_STYLE = { bg: "rgba(107,114,128,0.15)", color: "#6b7280" };

interface SourceRefLike {
  kind: string;
  title: string;
  url: string;
  retrieved_at: string;
}

interface SourceBadgeProps {
  source: string | null | undefined;
  hideManual?: boolean;
  size?: "sm" | "md";
  /** When multiple sources are provided, badge shows count and opens a tooltip listing all. */
  sources?: SourceRefLike[];
}

export default function SourceBadge({
  source,
  hideManual = true,
  size = "sm",
  sources,
}: SourceBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!showTooltip) return;
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowTooltip(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showTooltip]);

  if (!source) return null;
  if (hideManual && source === "manual") return null;

  const s = SOURCE_STYLES[source] ?? { ...DEFAULT_STYLE, label: source.toUpperCase() };
  const fontSize = size === "sm" ? 9 : 10;
  const padding = size === "sm" ? "1px 5px" : "2px 7px";

  const hasMultiple = sources && sources.length > 1;

  return (
    <span ref={wrapperRef} className="source-badge-wrapper">
      <span
        className="source-badge"
        onClick={hasMultiple ? () => setShowTooltip(!showTooltip) : undefined}
        title={hasMultiple ? `${sources.length} sources — click to view` : `Source: ${source}`}
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
          cursor: hasMultiple ? "pointer" : "default",
        }}
      >
        {s.label}
      </span>
      {hasMultiple && showTooltip && (
        <span className="source-badge-tooltip">
          {sources.map((src, i) => (
            <a
              key={i}
              href={src.url}
              target="_blank"
              rel="noopener noreferrer"
              className="source-badge-tooltip-item"
            >
              <span className="source-badge-tooltip-kind">
                {src.kind.replace(/_/g, " ").toUpperCase()}
              </span>
              <span className="source-badge-tooltip-title">{src.title}</span>
            </a>
          ))}
        </span>
      )}
    </span>
  );
}
