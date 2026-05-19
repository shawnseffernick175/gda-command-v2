import { useState, useRef, useEffect, useImperativeHandle, forwardRef } from "react";
import { useNavigate } from "react-router-dom";
import { fetchSearchResults, type SearchResult } from "../api/client";

const TYPE_ICONS: Record<string, string> = {
  opportunity: "📡",
  capture_plan: "🎯",
  intel: "🔍",
  contact: "👤",
  compliance: "📋",
  doctrine: "📖",
  proposal: "📄",
  report: "📑",
};

export interface GlobalSearchHandle {
  focus: () => void;
}

const GlobalSearch = forwardRef<GlobalSearchHandle, { collapsed: boolean }>(function GlobalSearch({ collapsed }, ref) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }));

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const env = await fetchSearchResults(value.trim());
        if (env.success && env.data && Array.isArray(env.data.results)) {
          setResults(env.data.results);
          setOpen(true);
        }
      } catch { /* ignore */ }
      setLoading(false);
    }, 300);
  }

  function handleSelect(result: SearchResult) {
    setOpen(false);
    setQuery("");
    navigate(result.path);
  }

  if (collapsed) {
    return (
      <button
        onClick={() => {/* expand sidebar first */}}
        title="Search"
        style={{
          background: "transparent",
          border: "none",
          color: "var(--color-text-muted)",
          cursor: "pointer",
          fontSize: 16,
          padding: "8px 0",
          width: "100%",
          display: "flex",
          justifyContent: "center",
        }}
      >
        🔎
      </button>
    );
  }

  return (
    <div ref={containerRef} style={{ position: "relative", padding: "8px 12px" }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 10px",
        background: "rgba(107,114,128,0.1)",
        borderRadius: 6,
        border: "1px solid transparent",
      }}>
        <span style={{ fontSize: 13, opacity: 0.5 }}>🔎</span>
        <input
          ref={inputRef}
          type="text"
          placeholder="Search everything...  (Ctrl+K)"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--color-text)",
            fontSize: 12,
            outline: "none",
            width: "100%",
          }}
        />
        {loading && <span style={{ fontSize: 10, color: "#9ca3af" }}>...</span>}
      </div>

      {open && results.length > 0 && (
        <div style={{
          position: "absolute",
          top: "100%",
          left: 12,
          right: 12,
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: 8,
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          maxHeight: 360,
          overflowY: "auto",
          zIndex: 200,
        }}>
          {results.map((r) => (
            <button
              key={`${r.type}-${r.id}`}
              onClick={() => handleSelect(r)}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                padding: "10px 12px",
                width: "100%",
                background: "transparent",
                border: "none",
                borderBottom: "1px solid var(--color-border)",
                cursor: "pointer",
                textAlign: "left",
                color: "var(--color-text)",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(59,130,246,0.08)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{ fontSize: 14, flexShrink: 0 }}>{TYPE_ICONS[r.type] ?? "📎"}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{r.title}</div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{r.snippet}</div>
                <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>
                  {(r.type ?? "item").replace(/_/g, " ")} · {Math.round((r.score ?? 0) * 100)}% match
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {open && results.length === 0 && query.length >= 2 && !loading && (
        <div style={{
          position: "absolute",
          top: "100%",
          left: 12,
          right: 12,
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: 8,
          padding: "16px",
          textAlign: "center",
          fontSize: 13,
          color: "#9ca3af",
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          zIndex: 200,
        }}>
          No results for "{query}"
        </div>
      )}
    </div>
  );
});

export default GlobalSearch;
