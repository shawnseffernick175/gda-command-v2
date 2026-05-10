import { Routes, Route, Link, useLocation } from "react-router-dom";
import QACenter from "./pages/QACenter";
import Home from "./pages/Home";
import OpsTracker from "./pages/OpsTracker";
import Pipeline from "./pages/Pipeline";

const NAV_ITEMS = [
  { path: "/", label: "Launchpad" },
  { path: "/qa-center", label: "QA Center" },
  { path: "/ops-tracker", label: "Ops Tracker" },
  { path: "/pipeline", label: "Pipeline" },
] as const;

export default function App() {
  const { pathname } = useLocation();

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header style={{
        background: "var(--color-surface)",
        borderBottom: "1px solid var(--color-border)",
        padding: "0 24px",
        display: "flex",
        alignItems: "center",
        height: 56,
        gap: 32,
      }}>
        <span style={{ fontWeight: 700, fontSize: 18, letterSpacing: "0.5px" }}>
          GDA Command
        </span>
        <nav style={{ display: "flex", gap: 4 }}>
          {NAV_ITEMS.map(({ path, label }) => (
            <Link
              key={path}
              to={path}
              style={{
                padding: "8px 16px",
                borderRadius: 6,
                fontSize: 14,
                fontWeight: pathname === path ? 600 : 400,
                color: pathname === path ? "var(--color-primary)" : "var(--color-text-muted)",
                background: pathname === path ? "rgba(59,130,246,0.1)" : "transparent",
              }}
            >
              {label}
            </Link>
          ))}
        </nav>
      </header>

      <main style={{ flex: 1, padding: 24 }}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/qa-center" element={<QACenter />} />
          <Route path="/ops-tracker" element={<OpsTracker />} />
          <Route path="/pipeline" element={<Pipeline />} />
        </Routes>
      </main>
    </div>
  );
}


