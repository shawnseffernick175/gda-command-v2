import { useState, useEffect } from "react";
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
import Reports from "./pages/Reports";
import PromptArchitect from "./pages/PromptArchitect";
import FastTrack from "./pages/FastTrack";
import Knowledge from "./pages/Knowledge";
import RFPShredder from "./pages/RFPShredder";
import FinancialKPIStrip from "./components/FinancialKPIStrip";
import GlobalSearch from "./components/GlobalSearch";
import NotificationCenter from "./components/NotificationCenter";

const NAV_GROUPS = [
  {
    label: "BD Tools",
    items: [
      { path: "/", label: "Launchpad", icon: "🏠" },
      { path: "/fast-track", label: "Fast Track", icon: "🚀" },
      { path: "/ops-tracker", label: "Ops Tracker", icon: "📡" },
      { path: "/pipeline", label: "Pipeline", icon: "📊" },
      { path: "/capture", label: "Capture", icon: "🎯" },
      { path: "/approvals", label: "Approvals", icon: "✓" },
      { path: "/rfp-shredder", label: "RFP Shredder", icon: "✂" },
    ],
  },
  {
    label: "Analysis",
    items: [
      { path: "/intel", label: "Intel Hub", icon: "🔍" },
      { path: "/compliance", label: "Compliance", icon: "📋" },
      { path: "/proposals", label: "Proposals", icon: "📄" },
      { path: "/contacts", label: "Contacts", icon: "👤" },
      { path: "/financial-bible", label: "Financials", icon: "💰" },
      { path: "/reports", label: "Reports", icon: "📑" },
      { path: "/knowledge", label: "Knowledge", icon: "📚" },
    ],
  },
  {
    label: "Platform",
    items: [
      { path: "/qa-center", label: "QA Center", icon: "🧪" },
      { path: "/doctrine", label: "Doctrine", icon: "📖" },
      { path: "/prompts", label: "Prompts", icon: "📝" },
      { path: "/workflows", label: "Workflows", icon: "⚙" },
      { path: "/settings", label: "Settings", icon: "⚡" },
    ],
  },
] as const;

const SIDEBAR_EXPANDED_WIDTH = 220;
const SIDEBAR_COLLAPSED_WIDTH = 52;

function isActive(pathname: string, itemPath: string): boolean {
  if (itemPath === "/") return pathname === "/";
  return pathname.startsWith(itemPath);
}

export default function App() {
  const { pathname } = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 768);
  const sidebarWidth = sidebarOpen ? SIDEBAR_EXPANDED_WIDTH : SIDEBAR_COLLAPSED_WIDTH;

  // Auto-collapse sidebar on narrow screens
  useEffect(() => {
    function handleResize() {
      if (window.innerWidth <= 768) {
        setSidebarOpen(false);
      }
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div style={{ minHeight: "100vh", display: "flex" }}>
      {/* Sidebar */}
      <aside style={{
        width: sidebarWidth,
        minWidth: sidebarWidth,
        background: "var(--color-surface)",
        borderRight: "1px solid var(--color-border)",
        display: "flex",
        flexDirection: "column",
        transition: "width 0.2s ease, min-width 0.2s ease",
        overflow: "hidden",
        position: "fixed",
        top: 0,
        left: 0,
        bottom: 0,
        zIndex: 100,
      }}>
        {/* Logo / Brand */}
        <div style={{
          padding: sidebarOpen ? "16px 16px 12px" : "16px 8px 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid var(--color-border)",
          minHeight: 56,
        }}>
          <Link to="/" style={{
            fontWeight: 700,
            fontSize: sidebarOpen ? 16 : 0,
            letterSpacing: "0.5px",
            textDecoration: "none",
            color: "var(--color-text)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            transition: "font-size 0.2s",
          }}>
            {sidebarOpen ? "GDA Command" : ""}
          </Link>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--color-text-muted)",
              cursor: "pointer",
              fontSize: 16,
              padding: "4px 6px",
              borderRadius: 4,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {sidebarOpen ? "◀" : "▶"}
          </button>
        </div>

        {/* Global Search */}
        <GlobalSearch collapsed={!sidebarOpen} />

        {/* Nav Groups */}
        <nav style={{
          flex: 1,
          overflow: "auto",
          padding: "8px 0",
        }}>
          {NAV_GROUPS.map((group) => (
            <div key={group.label} style={{ marginBottom: 8 }}>
              {sidebarOpen && (
                <div style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "var(--color-text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.8px",
                  padding: "8px 16px 4px",
                  opacity: 0.6,
                }}>
                  {group.label}
                </div>
              )}
              {!sidebarOpen && (
                <div style={{
                  height: 1,
                  background: "var(--color-border)",
                  margin: "4px 8px 8px",
                }} />
              )}
              {group.items.map(({ path, label, icon }) => {
                const active = isActive(pathname, path);
                return (
                  <Link
                    key={path}
                    to={path}
                    title={sidebarOpen ? undefined : label}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: sidebarOpen ? "7px 16px" : "7px 0",
                      margin: sidebarOpen ? "1px 8px" : "1px 6px",
                      borderRadius: 6,
                      fontSize: 13,
                      fontWeight: active ? 600 : 400,
                      color: active ? "var(--color-primary)" : "var(--color-text-muted)",
                      background: active ? "rgba(59,130,246,0.1)" : "transparent",
                      textDecoration: "none",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      transition: "background 0.15s",
                      justifyContent: sidebarOpen ? "flex-start" : "center",
                    }}
                  >
                    <span style={{
                      fontSize: 15,
                      width: 20,
                      textAlign: "center",
                      flexShrink: 0,
                      filter: active ? "none" : "grayscale(0.6)",
                      opacity: active ? 1 : 0.7,
                    }}>
                      {icon}
                    </span>
                    {sidebarOpen && <span>{label}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Notification Center */}
        <div style={{ borderTop: "1px solid var(--color-border)", padding: sidebarOpen ? "4px 0" : "4px 0" }}>
          <NotificationCenter collapsed={!sidebarOpen} />
        </div>

        {/* Bottom branding */}
        {sidebarOpen && (
          <div style={{
            padding: "12px 16px",
            borderTop: "1px solid var(--color-border)",
            fontSize: 10,
            color: "var(--color-text-muted)",
            opacity: 0.5,
            textAlign: "center",
          }}>
            GDA Command v2
          </div>
        )}
      </aside>

      {/* Main Content */}
      <div style={{
        flex: 1,
        marginLeft: sidebarWidth,
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        transition: "margin-left 0.2s ease",
      }}>
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
            <Route path="/reports" element={<Reports />} />
            <Route path="/prompts" element={<PromptArchitect />} />
            <Route path="/fast-track" element={<FastTrack />} />
            <Route path="/knowledge" element={<Knowledge />} />
            <Route path="/rfp-shredder" element={<RFPShredder />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
