import { Routes, Route, Link, useLocation } from "react-router-dom";
import QACenter from "./pages/QACenter";
import Home from "./pages/Home";
import OpsTracker from "./pages/OpsTracker";
import Pipeline from "./pages/Pipeline";
import OpportunityDetail from "./pages/OpportunityDetail";
import Doctrine from "./pages/Doctrine";
import Intel from "./pages/Intel";
import Capture from "./pages/Capture";
import Workflows from "./pages/Workflows";
import Settings from "./pages/Settings";
import FinancialBible from "./pages/FinancialBible";
import Approvals from "./pages/Approvals";
import Compliance from "./pages/Compliance";
import ProposalReview from "./pages/ProposalReview";
import Contacts from "./pages/Contacts";
import FinancialKPIStrip from "./components/FinancialKPIStrip";

const NAV_GROUPS = [
  {
    label: "BD Tools",
    items: [
      { path: "/", label: "Launchpad" },
      { path: "/ops-tracker", label: "Ops Tracker" },
      { path: "/pipeline", label: "Pipeline" },
      { path: "/capture", label: "Capture" },
      { path: "/approvals", label: "Approvals" },
    ],
  },
  {
    label: "Analysis",
    items: [
      { path: "/intel", label: "Intel Hub" },
      { path: "/compliance", label: "Compliance" },
      { path: "/proposals", label: "Proposals" },
      { path: "/contacts", label: "Contacts" },
      { path: "/financial-bible", label: "Financials" },
    ],
  },
  {
    label: "Platform",
    items: [
      { path: "/qa-center", label: "QA Center" },
      { path: "/doctrine", label: "Doctrine" },
      { path: "/workflows", label: "Workflows" },
      { path: "/settings", label: "Settings" },
    ],
  },
] as const;

function isActive(pathname: string, itemPath: string): boolean {
  if (itemPath === "/") return pathname === "/";
  return pathname.startsWith(itemPath);
}

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
        gap: 24,
      }}>
        <Link to="/" style={{ fontWeight: 700, fontSize: 18, letterSpacing: "0.5px", textDecoration: "none", color: "var(--color-text)" }}>
          GDA Command
        </Link>
        <nav style={{ display: "flex", gap: 16, alignItems: "center" }}>
          {NAV_GROUPS.map((group) => (
            <div key={group.label} style={{ display: "flex", alignItems: "center", gap: 2 }}>
              <span style={{
                fontSize: 10,
                fontWeight: 600,
                color: "var(--color-text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                marginRight: 4,
                opacity: 0.6,
              }}>
                {group.label}
              </span>
              {group.items.map(({ path, label }) => (
                <Link
                  key={path}
                  to={path}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: isActive(pathname, path) ? 600 : 400,
                    color: isActive(pathname, path) ? "var(--color-primary)" : "var(--color-text-muted)",
                    background: isActive(pathname, path) ? "rgba(59,130,246,0.1)" : "transparent",
                    textDecoration: "none",
                    whiteSpace: "nowrap",
                  }}
                >
                  {label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </header>

      <FinancialKPIStrip />

      <main style={{ flex: 1, padding: 24 }}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/qa-center" element={<QACenter />} />
          <Route path="/ops-tracker" element={<OpsTracker />} />
          <Route path="/pipeline" element={<Pipeline />} />
          <Route path="/opportunities/:id" element={<OpportunityDetail />} />
          <Route path="/doctrine" element={<Doctrine />} />
          <Route path="/intel" element={<Intel />} />
          <Route path="/capture" element={<Capture />} />
          <Route path="/workflows" element={<Workflows />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/financial-bible" element={<FinancialBible />} />
          <Route path="/financial-bible/:key" element={<FinancialBible />} />
          <Route path="/approvals" element={<Approvals />} />
          <Route path="/compliance" element={<Compliance />} />
          <Route path="/proposals" element={<ProposalReview />} />
          <Route path="/contacts" element={<Contacts />} />
        </Routes>
      </main>
    </div>
  );
}
