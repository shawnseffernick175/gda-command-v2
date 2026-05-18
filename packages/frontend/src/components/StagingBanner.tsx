import { useState, useEffect } from "react";
import { authenticatedFetch } from "../api/auth";

export default function StagingBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    async function checkFlag() {
      try {
        const res = await authenticatedFetch("/api/feature-flags");
        if (!res.ok) return;
        const body = await res.json();
        const flags = body?.data?.flags;
        if (flags?.staging_banner) setShow(true);
      } catch {
        // silently ignore — banner is non-critical
      }
    }
    checkFlag();
  }, []);

  if (!show) return null;

  return (
    <div
      style={{
        background: "linear-gradient(90deg, #f59e0b 0%, #d97706 100%)",
        color: "#fff",
        textAlign: "center",
        padding: "6px 16px",
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: 0.5,
        position: "relative",
        zIndex: 9999,
      }}
    >
      Staging build — production data is safe; this environment may reset.
      <button
        onClick={() => setShow(false)}
        style={{
          background: "none",
          border: "none",
          color: "#fff",
          cursor: "pointer",
          marginLeft: 12,
          fontSize: 14,
          fontWeight: 700,
        }}
        aria-label="Dismiss staging banner"
      >
        ×
      </button>
    </div>
  );
}
