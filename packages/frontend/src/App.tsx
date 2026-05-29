import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { Routes, Route, Link, useLocation } from "react-router-dom";
import Login from "./pages/Login";
import { isAuthenticated, logout, getUser, authenticatedFetch } from "./api/auth";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";
const Launchpad = lazy(() => import("./pages/Launchpad"));
const CompanyProfilePage = lazy(() => import("./pages/CompanyProfile"));

const QACenter = lazy(() => import("./pages/QACenter"));
const OpsTracker = lazy(() => import("./pages/OpsTracker"));
const Pipeline = lazy(() => import("./pages/Pipeline"));
const OpportunityDetail = lazy(() => import("./pages/OpportunityDetail"));
const Doctrine = lazy(() => import("./pages/Doctrine"));
const Intel = lazy(() => import("./pages/Intel"));
const Capture = lazy(() => import("./pages/Capture"));
const Workflows = lazy(() => import("./pages/Workflows"));
const Settings = lazy(() => import("./pages/Settings"));
const FinancialBible = lazy(() => import("./pages/FinancialBible"));
const Approvals = lazy(() => import("./pages/Approvals"));
const Compliance = lazy(() => import("./pages/Compliance"));
const ProposalReview = lazy(() => import("./pages/ProposalReview"));
const ProposalBuilder = lazy(() => import("./pages/ProposalBuilder"));
const Contacts = lazy(() => import("./pages/Contacts"));
const Reports = lazy(() => import("./pages/Reports"));
const PromptArchitect = lazy(() => import("./pages/PromptArchitect"));
const FastTrack = lazy(() => import("./pages/FastTrack"));
const Knowledge = lazy(() => import("./pages/Knowledge"));
const RFPShredder = lazy(() => import("./pages/RFPShredder"));
const Predictive = lazy(() => import("./pages/Predictive"));
const ColorReview = lazy(() => import("./pages/ColorReview"));
const AnomalyDetection = lazy(() => import("./pages/AnomalyDetection"));
const SAMMonitor = lazy(() => import("./pages/SAMMonitor"));
const FPDSMonitor = lazy(() => import("./pages/FPDSMonitor"));
const UserManagement = lazy(() => import("./pages/UserManagement"));
const AuditLog = lazy(() => import("./pages/AuditLog"));
const UserManual = lazy(() => import("./pages/UserManual"));
const Charts = lazy(() => import("./pages/Charts"));
const BookOfTruths = lazy(() => import("./pages/BookOfTruths"));
const GovWin = lazy(() => import("./pages/GovWin"));
const RiskRegister = lazy(() => import("./pages/RiskRegister"));
const ProposalCenter = lazy(() => import("./pages/ProposalCenter"));
const AdminTrash = lazy(() => import("./pages/AdminTrash"));
const AdminCompanies = lazy(() => import("./pages/AdminCompanies"));
const VehicleClassification = lazy(() => import("./pages/VehicleClassification"));
const SourceManager = lazy(() => import("./pages/SourceManager"));
const MergerContext = lazy(() => import("./pages/MergerContext"));
const AIGateway = lazy(() => import("./pages/AIGateway"));
const CaptureDiscipline = lazy(() => import("./pages/CaptureDiscipline"));
import FinancialKPIStrip from "./components/FinancialKPIStrip";
import GlobalSearch, { type GlobalSearchHandle } from "./components/GlobalSearch";
import NotificationCenter from "./components/NotificationCenter";
import ErrorBoundary from "./components/ErrorBoundary";
import Breadcrumb from "./components/Breadcrumb";
import { ToastProvider } from "./components/Toast";
import QuickEntry from "./components/QuickEntry";
import StagingBanner from "./components/StagingBanner";

const NAV_GROUPS = [
  {
    label: "Operations",
    items: [
      { path: "/", label: "Launchpad", icon: "🏠" },
      { path: "/company-profile", label: "Company Profile", icon: "🏛" },
      { path: "/fast-track", label: "Fast Track", icon: "🚀" },
      { path: "/ops-tracker", label: "Ops Tracker", icon: "📡" },
      { path: "/pipeline", label: "Pipeline", icon: "📊" },
      { path: "/vehicles", label: "Vehicles", icon: "🏗" },
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
      { path: "/mergers", label: "M&A Context", icon: "🔗" },
      { path: "/ai-gateway", label: "AI Gateway", icon: "🤖" },
      { path: "/capture-discipline", label: "Capture Discipline", icon: "🎯" },
    ],
  },
  {
    label: "Reporting",
    items: [
      { path: "/financial-bible", label: "Financial Bible", icon: "💰" },
      { path: "/reports", label: "Reports", icon: "📑" },
      { path: "/charts", label: "Charts", icon: "📈" },

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
      { path: "/admin/companies", label: "Companies", icon: "🏢" },
      { path: "/admin/trash", label: "Trash", icon: "🗑" },
      { path: "/doctrine", label: "Doctrine", icon: "📖" },
      { path: "/book-of-truths", label: "Book of Truths", icon: "📓" },
      { path: "/prompts", label: "Prompts", icon: "📝" },
      { path: "/help", label: "User Manual", icon: "❓" },
      { path: "/sources", label: "Data Sources", icon: "🔌" },
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
    await logout();
    setAuthed(false);
  }, []);

  // On mount, probe /api/auth/me to determine auth state.
  // Uses authenticatedFetch so token auto-refresh works.
  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await authenticatedFetch("/api/auth/me");
        if (res.ok) {
          const body = await res.json();
          if (body.data) {
            localStorage.setItem("gda_user", JSON.stringify(body.data));
          }
        }
        setAuthed(res.ok);
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
      <div className="min-h-screen flex items-center justify-center bg-bg text-muted">
        Loading...
      </div>
    );
  }

  // Gate: show login when not authenticated
  if (!authed) {
    return <Login onAuth={() => setAuthed(true)} />;
  }

  return (
    <ErrorBoundary>
    <ToastProvider>
    <StagingBanner />
    <div className="min-h-screen flex bg-bg text-ink font-sans">
      {/* Mobile sidebar backdrop */}
      {isMobile && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-black/50 z-[99]"
        />
      )}

      {/* Sidebar */}
      <aside
        className="fixed top-0 left-0 bottom-0 z-[100] flex flex-col overflow-hidden bg-white border-r border-border"
        style={{
          width: isMobile ? SIDEBAR_EXPANDED_WIDTH : sidebarWidth,
          minWidth: isMobile ? SIDEBAR_EXPANDED_WIDTH : sidebarWidth,
          transition: isMobile ? "transform 0.25s ease" : "width 0.2s ease, min-width 0.2s ease",
          transform: isMobile && !sidebarOpen ? "translateX(-100%)" : "translateX(0)",
        }}
      >
        {/* Logo / Brand */}
        <div
          className="flex items-center justify-between border-b border-border min-h-[56px]"
          style={{ padding: sidebarOpen ? "16px 16px 12px" : "16px 8px 12px" }}
        >
          <Link
            to="/"
            className="font-bold text-ink no-underline whitespace-nowrap overflow-hidden transition-all"
            style={{ fontSize: sidebarOpen ? 16 : 0 }}
          >
            {sidebarOpen ? "GDA Command" : ""}
          </Link>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            className="bg-transparent border-none text-muted cursor-pointer text-[16px] p-1 rounded flex items-center justify-center shrink-0"
          >
            {sidebarOpen ? "◀" : "▶"}
          </button>
        </div>

        {/* Global Search */}
        <GlobalSearch ref={searchRef} collapsed={!sidebarOpen} />

        {/* Nav Groups */}
        <nav className="flex-1 overflow-auto py-2">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-2">
              {sidebarOpen && (
                <div className="text-[10px] font-semibold text-muted uppercase tracking-wider px-4 pt-2 pb-1 opacity-60">
                  {group.label}
                </div>
              )}
              {!sidebarOpen && (
                <div className="h-px bg-border mx-2 mb-2 mt-1" />
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
                    className={`flex items-center gap-2.5 text-[13px] no-underline whitespace-nowrap overflow-hidden rounded transition-colors duration-[120ms] ${
                      sidebarOpen ? "px-4 py-[7px] mx-2 my-px justify-start" : "py-[7px] mx-1.5 my-px justify-center"
                    } ${
                      active
                        ? "font-semibold text-accent border-b-0"
                        : "font-normal text-muted"
                    }`}
                    style={active ? { background: "rgba(1,105,111,0.08)" } : undefined}
                  >
                    <span
                      className="text-[15px] w-5 text-center shrink-0"
                      style={{
                        filter: active ? "none" : "grayscale(0.6)",
                        opacity: active ? 1 : 0.7,
                      }}
                    >
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
        <div className="border-t border-border py-1">
          <NotificationCenter collapsed={!sidebarOpen} />
        </div>

        {/* User / Logout */}
        <div
          className="border-t border-border flex items-center gap-2"
          style={{ padding: sidebarOpen ? "8px 12px" : "8px 4px" }}
        >
          {sidebarOpen ? (
            <>
              <span className="caption flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                {getUser()?.display_name ?? "Admin"}
              </span>
              <button
                onClick={handleLogout}
                title="Sign out"
                className="btn text-[11px] px-2 py-0.5"
              >
                Logout
              </button>
            </>
          ) : (
            <button
              onClick={handleLogout}
              title="Sign out"
              className="bg-transparent border-none cursor-pointer text-[16px] w-full text-center py-1"
            >
              {"🚪"}
            </button>
          )}
        </div>

        {/* Bottom branding */}
        {sidebarOpen && (
          <div className="px-4 py-2 text-[10px] text-muted opacity-50 text-center">
            GDA Command v2
          </div>
        )}
      </aside>

      {/* Main Content */}
      <div
        className="flex-1 flex flex-col min-h-screen"
        style={{
          marginLeft: isMobile ? 0 : sidebarWidth,
          transition: isMobile ? "none" : "margin-left 0.2s ease",
        }}
      >
        {/* Mobile header with hamburger */}
        {isMobile && (
          <div className="flex items-center gap-3 px-4 py-2.5 bg-white border-b border-border sticky top-0 z-50">
            <button
              onClick={() => setSidebarOpen(true)}
              className="bg-transparent border-none text-ink cursor-pointer text-[20px] p-1 rounded flex items-center"
              aria-label="Open menu"
            >
              ☰
            </button>
            <span className="font-bold text-[14px]">GDA Command</span>
          </div>
        )}

        <FinancialKPIStrip />

        <main className={`flex-1 ${isMobile ? "p-3" : "p-6"}`}>
          <Breadcrumb />
          <Suspense fallback={<div className="p-8 text-center text-muted">Loading…</div>}>
          <Routes>
            <Route path="/" element={<Launchpad />} />
            <Route path="/home" element={<Home />} />
            <Route path="/company-profile" element={<CompanyProfilePage />} />
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
            <Route path="/vehicles" element={<VehicleClassification />} />


            <Route path="/fpds-monitor" element={<FPDSMonitor />} />
            <Route path="/admin/users" element={<UserManagement />} />
            <Route path="/admin/audit" element={<AuditLog />} />
            <Route path="/admin/companies" element={<AdminCompanies />} />
            <Route path="/admin/trash" element={<AdminTrash />} />
            <Route path="/charts" element={<Charts />} />
            <Route path="/govwin" element={<GovWin />} />
            <Route path="/book-of-truths" element={<BookOfTruths />} />
            <Route path="/help" element={<UserManual />} />
            <Route path="/risk-register" element={<RiskRegister />} />
            <Route path="/proposal-center" element={<ProposalCenter />} />
            <Route path="/sources" element={<SourceManager />} />
            <Route path="/mergers" element={<MergerContext />} />
            <Route path="/ai-gateway" element={<AIGateway />} />
            <Route path="/capture-discipline" element={<CaptureDiscipline />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
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

  const abortRef = useRef<AbortController | null>(null);

  const handleAsk = async () => {
    if (!question.trim() || loading) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const timer = setTimeout(() => controller.abort(), 65_000);
    setLoading(true);
    setAnswer("");
    try {
      const res = await authenticatedFetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question.trim(), context: pathname }),
        signal: controller.signal,
      });
      const data = await res.json();
      setAnswer(data?.data?.answer ?? data?.error?.message ?? "Could not get an answer. The AI service may be unavailable.");
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setAnswer("Request timed out. The AI service may be overloaded — please try again.");
      } else {
        setAnswer("Error connecting to AI service. Check that OpenAI API key is configured in Settings.");
      }
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Ask a question about anything in GDA Command"
        className="fixed bottom-20 right-4 w-10 h-10 rounded-full bg-accent text-white border-none cursor-pointer text-[18px] shadow-md z-[10000] flex items-center justify-center opacity-85"
      >?</button>
    );
  }

  return (
    <div className="fixed bottom-20 right-4 w-[380px] max-h-[420px] bg-white border border-border rounded shadow-lg z-[10000] flex flex-col">
      <div className="p-3 px-4 border-b border-border flex justify-between items-center">
        <span className="font-bold text-[14px]">Ask a Question</span>
        <button onClick={() => setOpen(false)} className="bg-transparent border-none text-muted cursor-pointer text-[16px]">X</button>
      </div>
      {answer && (
        <div className="p-4 text-[13px] leading-relaxed overflow-y-auto max-h-[260px] border-b border-border">
          {answer}
        </div>
      )}
      <div className="p-3 flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleAsk(); }}
          placeholder="Ask about opportunities, pipeline, competitors..."
          className="flex-1 px-3 py-2 bg-bg border border-border rounded text-ink text-[13px]"
        />
        <button
          onClick={handleAsk}
          disabled={loading}
          className={`px-3.5 py-2 text-white border-none rounded cursor-pointer font-semibold text-[13px] ${loading ? "bg-muted" : "bg-accent"}`}
        >
          {loading ? "..." : "Ask"}
        </button>
      </div>
    </div>
  );
}
