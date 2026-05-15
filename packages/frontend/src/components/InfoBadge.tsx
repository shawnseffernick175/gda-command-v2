import { useState, useRef, useEffect } from "react";

interface InfoBadgeProps {
  whatItIs: string;
  whatItMeans: string;
  howCalculated?: string;
  size?: number;
}

export default function InfoBadge({ whatItIs, whatItMeans, howCalculated, size = 18 }: InfoBadgeProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <button
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen((o) => !o); }}
        title="More info"
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: "#1a1a2e",
          border: "1.5px solid #333",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          padding: 2,
          marginLeft: 2,
          fontSize: size * 0.6,
          fontWeight: 800,
          color: "#facc15",
          lineHeight: 1,
          flexShrink: 0,
        }}
      >
        ?
      </button>
      {open && (
        <div style={{
          position: "absolute",
          top: size + 6,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 1000,
          width: 300,
          background: "#1e1e2f",
          border: "1px solid #333",
          borderRadius: 8,
          padding: 16,
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
        }}>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#facc15", marginBottom: 4 }}>
              What it is
            </div>
            <div style={{ fontSize: 13, color: "#e5e5e5", lineHeight: 1.4 }}>{whatItIs}</div>
          </div>
          <div style={{ marginBottom: howCalculated ? 10 : 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#facc15", marginBottom: 4 }}>
              What it means
            </div>
            <div style={{ fontSize: 13, color: "#e5e5e5", lineHeight: 1.4 }}>{whatItMeans}</div>
          </div>
          {howCalculated && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#facc15", marginBottom: 4 }}>
                How it's calculated
              </div>
              <div style={{ fontSize: 13, color: "#e5e5e5", lineHeight: 1.4 }}>{howCalculated}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
