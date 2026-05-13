import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

interface InfoBadgeProps {
  whatItIs: string;
  whatItMeans: string;
  howCalculated?: string;
  size?: number;
}

export default function InfoBadge({ whatItIs, whatItMeans, howCalculated, size = 18 }: InfoBadgeProps) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const updatePos = useCallback(() => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 6, left: rect.left + rect.width / 2 });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePos();
    function handleClick(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node) &&
          btnRef.current && !btnRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, updatePos]);

  return (
    <>
      <button
        ref={btnRef}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o); }}
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
          padding: 0,
          fontSize: size * 0.6,
          fontWeight: 800,
          color: "#facc15",
          lineHeight: 1,
          flexShrink: 0,
        }}
      >
        ?
      </button>
      {open && createPortal(
        <div ref={popupRef} style={{
          position: "fixed",
          top: pos.top,
          left: pos.left,
          transform: "translateX(-50%)",
          zIndex: 10000,
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
        </div>,
        document.body,
      )}
    </>
  );
}
