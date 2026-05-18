import { useState, useEffect, useCallback, useRef } from "react";
import { Routes, Route, Link, useLocation } from "react-router-dom";
import Login from "./pages/Login";
import { isAuthenticated, logout, getUser, startTokenRefreshTimer, stopTokenRefreshTimer } from "./api/auth";
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
import ProposalBuilder from "./pages/ProposalBuilder";
import Contacts from "./pages/Contacts";
import Reports from "./pages/Reports";
import PromptArchitect from "./pages/PromptArchitect";
import FastTrack from "./pages/FastTrack";
import Knowledge from "./pages/Knowledge";
import RFPShredder from "./pages/RFPShredder";
import Predictive from "./pages/Predictive";
import ColorReview from "./pages/ColorReview";
import AnomalyDetection from "./pages/AnomalyDetection";
import SAMMonitor from "./pages/SAMMonitor";
import Discussions from "./pages/Discussions";

import FPDSMonitor from "./pages/FPDSMonitor";
import UserManagement from "./pages/UserManagement";
import AuditLog from "./pages/AuditLog";
import UserManual from "./pages/UserManual";
import Charts from "./pages/Charts";
import BookOfTruths from "./pages/BookOfTruths";
import GovWin from "./pages/GovWin";
import RiskRegister from "./pages/RiskRegister";
import ProposalCenter from "./pages/ProposalCenter";
import NotFound from "./pages/NotFound";
import FinancialKPIStrip from "./components/FinancialKPIStrip";
import GlobalSearch, { type GlobalSearchHandle } from "./components/GlobalSearch";
import NotificationCenter from "./components/NotificationCenter";
import ErrorBoundary from "./components/ErrorBoundary";
import Breadcrumb from "./components/Breadcrumb";
import { ToastProvider } from "./components/Toast";
import QuickEntry from "./components/QuickEntry";

const NAV_GROUPS = [
  {
    label: "Operations",
    items: [
      { path: "/", label: "Launchpad", icon: "🏠" },
      { path: "/fast-track", label: "Fast Track", icon: "🚀" },
      { path: "/ops-tracker", label: "Ops Tracker", icon: "📡" },
      { path: "/pipeline", label: "Pipeline", icon: "📊" },
      { path: "/approvals", label: "Approvals", icon: "✓" },
      { path: "/risk-register", label: "Risk Register", icon: "⚠" },
    ],
  },
  {
    label: "Capture",
    items: [
      { path: "/proposal-center", label: "Proposal Center", icon: "📝" },
      { path: "/rfp-shredder", label: "RFP Shredder", icon: "✂" },
      { path: "/compliance", label: "Compliance", icon: "📋" },
      { path: "/proposals", label: "Proposal Builder", icon: "📄" },
      { path: "/color-review", label: "Color Review", icon: "🎨" },
      { path: "/capture", label: "Capture Plans", icon: "🎯" },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { path: "/intel", label: "Intel Hub", icon: "🔍" },
      { path: "/predictive", label: "Predictive", icon: "🧠" },
      { path: "/anomaly", label: "Anomaly Detection", icon: "🔔" },
      { path: "/contacts", label: "Contacts", icon: "👤" },
      { path: "/knowledge", label: "Knowledge Base", icon: "📚" },

      { path: "/govwin", label: "GovWin IQ", icon: "🌐" },
    ],
  },
  {
    label: "Reporting",
    items: [
      { path: "/financial-bible", label: "Financials", icon: "💰" },
      { path: "/reports", label: "Reports", icon: "📑" },
      { path: "/charts", label: "Charts", icon: "📈" },
      { path: "/discussions", label: "Discussions", icon: "💬" },
    ],
  },
  {
    label: "Admin",
    items: [
      { path: "/settings", label: "Settings", icon: "⚡" },
      { path: "/qa-center", label: "Health", icon: "🧪" },
      { path: "/workflows", label: "Workflows", icon: "⚙" },
      { path: "/admin/users", label: "Users", icon: "👥" },
      { path: "/admin/audit", label: "Audit Log", icon: "📜" },
      { path: "/doctrine", label: "Doctrine", icon: "📖" },
      { path: "/book-of-truths", label: "Book of Truths", icon: "📓" },
      { path: "/prompts", label: "Prompts", icon: "📝" },
      { path: "/help", label: "User Manual", icon: "❓" },
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
  const [authed, setAuthed] = useState<boolean | null>(null); // null = loading
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768);
  const sidebarWidth = isMobile ? (sidebarOpen ? SIDEBAR_EXPANDED_WIDTH : 0) : (sidebarOpen ? SIDEBAR_EXPANDED_WIDTH : SIDEBAR_COLLAPSED_WIDTH);
  const searchRef = useRef<GlobalSearchHandle>(null);

  // Ctrl+K shortcut to focus global search
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        if (!sidebarOpen) setSidebarOpen(true);
        // Small delay to let sidebar expand before focusing
        setTimeout(() => searchRef.current?.focus(), sidebarOpen ? 0 : 250);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [sidebarOpen]);

  const handleLogout = useCallback(async () => {
    stopTokenRefreshTimer();
    await logout();
    setAuthed(false);
  }, []);

  // On mount, probe /api/auth/me to determine auth state.
  // In dev mode (AUTH_REQUIRED=false), backend injects admin — no token needed.
  // Stores user data from response so getUser() returns role for nav filtering.
  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch("/api/auth/me", {
          headers: isAuthenticated()
            ? { Authorization: `Bearer ${localStorage.getItem("gda_access_token")}` }
            : {},
        });
        if (res.ok) {
          const body = await res.json();
          if (body.data) {
            localStorage.setItem("gda_user", JSON.stringify(body.data));
          }
        }
        setAuthed(res.ok);
        if (res.ok) startTokenRefreshTimer();
      } catch {
        setAuthed(false);
      }
    }
    checkAuth();
  }, []);

  // Listen for storage changes (picks up token refresh / logout in other tabs)
  useEffect(() => {
    const check = () => {
      if (!isAuthenticated()) setAuthed(false);
    };
    window.addEventListener("storage", check);
    return () => window.removeEventListener("storage", check);
  }, []);

  // Track mobile state and auto-collapse sidebar on narrow screens
  useEffect(() => {
    function handleResize() {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      if (mobile) setSidebarOpen(false);
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Close sidebar when navigating on mobile
  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [pathname, isMobile]);

  // Loading state while checking auth
  if (authed === null) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0f172a", color: "#94a3b8" }}>
        Loading...
      </div>
    );
  }

  // Gate: show login when not authenticated
  if (!authed) {
    return <Login onAuth={() => { setAuthed(true); startTokenRefreshTimer(); }} />;
  }

  return (
    <ErrorBoundary>
    <ToastProvider>
    <div style={{ minHeight: "100vh", display: "flex" }}>
      {/* Mobile sidebar backdrop */}
      {isMobile && sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 99,
          }}
        />
      )}

      {/* Sidebar */}
      <aside style={{
        width: isMobile ? SIDEBAR_EXPANDED_WIDTH : sidebarWidth,
        minWidth: isMobile ? SIDEBAR_EXPANDED_WIDTH : sidebarWidth,
        background: "var(--color-surface)",
        borderRight: "1px solid var(--color-border)",
        display: "flex",
        flexDirection: "column",
        transition: isMobile ? "transform 0.25s ease" : "width 0.2s ease, min-width 0.2s ease",
        overflow: "hidden",
        position: "fixed",
        top: 0,
        left: 0,
        bottom: 0,
        zIndex: 100,
        transform: isMobile && !sidebarOpen ? "translateX(-100%)" : "translateX(0)",
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
        <GlobalSearch ref={searchRef} collapsed={!sidebarOpen} />

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
              {group.items
                .filter(({ path }) => {
                  // Admin-only pages
                  if (path === "/admin/users" || path === "/admin/audit") {
                    const u = getUser();
                    return u?.role === "admin";
                  }
                  return true;
                })
                .map(({ path, label, icon }) => {
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

        {/* User / Logout */}
        <div style={{
          borderTop: "1px solid var(--color-border)",
          padding: sidebarOpen ? "8px 12px" : "8px 4px",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}>
          {sidebarOpen ? (
            <>
              <span style={{ fontSize: 12, color: "var(--color-text-muted)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {getUser()?.display_name ?? "Admin"}
              </span>
              <button
                onClick={handleLogout}
                title="Sign out"
                style={{
                  background: "none",
                  border: "1px solid var(--color-border)",
                  borderRadius: 4,
                  color: "var(--color-text-muted)",
                  cursor: "pointer",
                  fontSize: 11,
                  padding: "2px 8px",
                }}
              >
                Logout
              </button>
            </>
          ) : (
            <button
              onClick={handleLogout}
              title="Sign out"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 16,
                width: "100%",
                textAlign: "center",
                padding: "4px 0",
              }}
            >
              {"🚪"}
            </button>
          )}
        </div>

        {/* Bottom branding */}
        {sidebarOpen && (
          <div style={{
            padding: "8px 16px",
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
        marginLeft: isMobile ? 0 : sidebarWidth,
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        transition: isMobile ? "none" : "margin-left 0.2s ease",
      }}>
        {/* Mobile header with hamburger */}
        {isMobile && (
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 16px",
            background: "var(--color-surface)",
            borderBottom: "1px solid var(--color-border)",
            position: "sticky",
            top: 0,
            zIndex: 50,
          }}>
            <button
              onClick={() => setSidebarOpen(true)}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--color-text)",
                cursor: "pointer",
                fontSize: 20,
                padding: "4px 8px",
                borderRadius: 4,
                display: "flex",
                alignItems: "center",
              }}
              aria-label="Open menu"
            >
              ☰
            </button>
            <span style={{ fontWeight: 700, fontSize: 14 }}>GDA Command</span>
          </div>
        )}

        <FinancialKPIStrip />

        <main style={{ flex: 1, padding: isMobile ? 12 : 24 }}>
          <Breadcrumb />
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
            <Route path="/proposals" element={<ProposalBuilder />} />
            <Route path="/contacts" element={<Contacts />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/prompts" element={<PromptArchitect />} />
            <Route path="/fast-track" element={<FastTrack />} />
            <Route path="/knowledge" element={<Knowledge />} />
            <Route path="/rfp-shredder" element={<RFPShredder />} />
            <Route path="/predictive" element={<Predictive />} />
            <Route path="/color-review" element={<ColorReview />} />
            <Route path="/anomaly" element={<AnomalyDetection />} />
            <Route path="/sam-monitor" element={<SAMMonitor />} />
            <Route path="/discussions" element={<Discussions />} />

            <Route path="/fpds-monitor" element={<FPDSMonitor />} />
            <Route path="/admin/users" element={<UserManagement />} />
            <Route path="/admin/audit" element={<AuditLog />} />
            <Route path="/charts" element={<Charts />} />
            <Route path="/govwin" element={<GovWin />} />
            <Route path="/book-of-truths" element={<BookOfTruths />} />
            <Route path="/help" element={<UserManual />} />
            <Route path="/risk-register" element={<RiskRegister />} />
            <Route path="/proposal-center" element={<ProposalCenter />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
      </div>
    </div>
    <QuickEntry />
    <AskAnythingFAB />
    </ToastProvider>
    </ErrorBoundary>
  );
}

function AskAnythingFAB() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const { pathname } = useLocation();

  // Clear answer when navigating to a new page
  useEffect(() => {
    setAnswer("");
  }, [pathname]);

  const handleAsk = async () => {
    if (!question.trim() || loading) return;
    setLoading(true);
    setAnswer("");
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("gda_access_token") ?? ""}` },
        body: JSON.stringify({ question: question.trim(), context: pathname }),
      });
      const data = await res.json();
      setAnswer(data?.data?.answer ?? data?.error?.message ?? "Could not get an answer. The AI service may be unavailable.");
    } catch {
      setAnswer("Error connecting to AI service. Check that OpenAI API key is configured in Settings.");
    }
    setLoading(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Ask a question about anything in GDA Command"
        style={{
          position: "fixed", bottom: 24, right: 24, width: 52, height: 52, borderRadius: "50%",
          background: "#3b82f6", color: "#fff", border: "none", cursor: "pointer", fontSize: 22,
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >?</button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, width: 380, maxHeight: 420,
      background: "var(--color-surface)", border: "1px solid var(--color-border)",
      borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.3)", zIndex: 10000, display: "flex", flexDirection: "column",
    }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--color-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>Ask a Question</span>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "var(--color-text-muted)", cursor: "pointer", fontSize: 16 }}>X</button>
      </div>
      {answer && (
        <div style={{ padding: 16, fontSize: 13, lineHeight: 1.6, overflowY: "auto", maxHeight: 260, borderBottom: "1px solid var(--color-border)" }}>
          {answer}
        </div>
      )}
      <div style={{ padding: 12, display: "flex", gap: 8 }}>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleAsk(); }}
          placeholder="Ask about opportunities, pipeline, competitors..."
          style={{ flex: 1, padding: "8px 12px", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 6, color: "var(--color-text)", fontSize: 13 }}
        />
        <button onClick={handleAsk} disabled={loading} style={{ padding: "8px 14px", background: loading ? "#6b7280" : "#3b82f6", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
          {loading ? "..." : "Ask"}
        </button>
      </div>
    </div>
  );
}
