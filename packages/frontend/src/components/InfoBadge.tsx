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
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const updatePosition = useCallback(() => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - 150;
    if (left < 8) left = 8;
    if (left + 300 > window.innerWidth - 8) left = window.innerWidth - 308;
    setPos({ top: rect.bottom + 6, left });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    function handleClick(e: MouseEvent) {
      if (
        btnRef.current?.contains(e.target as Node) ||
        popoverRef.current?.contains(e.target as Node)
      ) return;
      setOpen(false);
    }
    function handleScroll() { updatePosition(); }
    document.addEventListener("mousedown", handleClick);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleScroll);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleScroll);
    };
  }, [open, updatePosition]);

  return (
    <>
      <button
        ref={btnRef}
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
          marginLeft: 4,
          fontSize: size * 0.6,
          fontWeight: 800,
          color: "#facc15",
          lineHeight: 1,
          flexShrink: 0,
        }}
      >
        ?
      </button>
      {open && pos && createPortal(
        <div
          ref={popoverRef}
          style={{
            position: "fixed",
            top: pos.top,
            left: pos.left,
            zIndex: 99999,
            width: 300,
            background: "#1e1e2f",
            border: "1px solid #333",
            borderRadius: 8,
            padding: 16,
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          }}
        >
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
        document.body
      )}
    </>
  );
}
