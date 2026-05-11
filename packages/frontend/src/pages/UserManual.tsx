import { useState } from "react";

interface PageSection {
  id: string;
  title: string;
  icon: string;
  group: string;
  description: string;
  features: string[];
  tips: string[];
}

const PAGE_SECTIONS: PageSection[] = [
  // Operations
  {
    id: "launchpad",
    title: "Launchpad",
    icon: "\u{1F3E0}",
    group: "Operations",
    description:
      "Your command center dashboard. Shows KPIs, opportunity funnel, top opportunities, and command signals at a glance. Widgets can be reordered and hidden via the Customize button.",
    features: [
      "Financial KPI strip across the top (Orders, Sales, EBIT, Gross Profit, ROS, Funded Backlog, Contract Backlog)",
      "Drag-and-drop widget reordering in edit mode",
      "Opportunity funnel visualization by stage",
      "Command signals with urgency-based alerts",
      "Quick access links to key pages",
    ],
    tips: [
      "Click 'Customize' to drag widgets into your preferred order or hide ones you don't need",
      "Click any opportunity row to see full details",
      "The KPI strip updates automatically from your financial data",
    ],
  },
  {
    id: "fast-track",
    title: "Fast Track",
    icon: "\u{1F680}",
    group: "Operations",
    description:
      "Quick-entry for new opportunities. Evaluate a potential opportunity in minutes by filling out key fields and getting an AI-assisted assessment. Approved items promote directly to Ops Tracker.",
    features: [
      "Rapid opportunity assessment form",
      "AI-generated OODA analysis (Observe, Orient, Decide, Act)",
      "One-click promote to full opportunity in Ops Tracker",
      "Tracks fast-track history for audit",
    ],
    tips: [
      "Use Fast Track when you first hear about an opportunity to quickly assess fit",
      "The OODA framework helps structure your go/no-go decision",
      "Promoted opportunities appear immediately in Ops Tracker",
    ],
  },
  {
    id: "ops-tracker",
    title: "Ops Tracker",
    icon: "\u{1F4E1}",
    group: "Operations",
    description:
      "The master opportunity tracking table. Every opportunity in your pipeline lives here with status, value, Pwin, Shipley stage, and data source badges. Supports filtering, sorting, and inline editing.",
    features: [
      "Full opportunity table with all key fields",
      "Shipley stage dropdown (Interest \u2192 Qualify \u2192 Pursue \u2192 Capture \u2192 Propose \u2192 Submit \u2192 Win)",
      "Source badges showing data origin (SAM.gov, FPDS, GovWin, GovTribe)",
      "Smart Recommendations powered by AI analysis",
      "Click any row to see opportunity detail page",
      "CSV export for all data",
    ],
    tips: [
      "Hover over the ? badge next to Smart Recommendations to learn how they work",
      "Source badges show where each data point came from",
      "Use column headers to sort by any field",
    ],
  },
  {
    id: "pipeline",
    title: "Pipeline",
    icon: "\u{1F4CA}",
    group: "Operations",
    description:
      "Filtered view of approved/qualified opportunities. Shows pipeline count, total value, and average Pwin. Each row links to the same opportunity detail page.",
    features: [
      "Summary cards: Pipeline Count, Total Value, Avg Pwin",
      "Filterable and sortable table",
      "Clickable rows linking to opportunity details",
      "Consistent data across all views",
    ],
    tips: [
      "Pipeline only shows opportunities that have passed your qualify gate",
      "Click any row to see the same detail page you'd see from Ops Tracker",
    ],
  },
  {
    id: "approvals",
    title: "Approvals",
    icon: "\u2713",
    group: "Operations",
    description:
      "Your human-in-the-loop approval queue. Anything requiring sign-off lands here \u2014 qualify decisions, bid/no-bid, risk acceptances, and AI recommendations needing review.",
    features: [
      "Summary cards: Pending, Approved, Rejected counts",
      "Grouped by category: Opportunities, Risks, Other",
      "One-click approve/reject workflow",
      "Audit trail for all decisions",
    ],
    tips: [
      "Check this page daily for items needing your attention",
      "All approval decisions are logged in the Audit Log",
    ],
  },
  // Capture
  {
    id: "capture",
    title: "Capture Plans",
    icon: "\u{1F3AF}",
    group: "Capture",
    description:
      "Your capture management hub. Tracks BD activities, milestones, gate reviews, and teaming arrangements for active pursuits. Summary cards show plan health at a glance.",
    features: [
      "Summary cards: Active Plans, Total Value, Avg Pwin, Bid Decisions, Pending, At-Risk",
      "Milestone tracking with due dates",
      "Teaming partner management",
      "Gate review history",
      "Shipley stage progression timeline",
    ],
    tips: [
      "Use this page to manage your active pursuit strategies",
      "Summary KPIs will be clickable to filter the table below",
      "Track how much you have in BD, Capture, and Awaiting Award stages",
    ],
  },
  {
    id: "proposals",
    title: "Proposals",
    icon: "\u{1F4C4}",
    group: "Capture",
    description:
      "Manage proposal documents and track proposal progress. View proposal status, team assignments, deadlines, and submission history.",
    features: [
      "Proposal status tracking",
      "Team assignment management",
      "Deadline tracking with alerts",
      "Document version history",
    ],
    tips: [
      "Keep proposal statuses updated so the dashboard reflects accurate data",
    ],
  },
  {
    id: "rfp-shredder",
    title: "RFP Shredder",
    icon: "\u2702",
    group: "Capture",
    description:
      "Upload RFP/solicitation documents and AI parses them into structured requirements. Supports PDF, Word (.docx), Excel (.xlsx), and PowerPoint (.pptx) formats.",
    features: [
      "Multi-format document upload (PDF, DOCX, XLSX, PPTX)",
      "AI-powered requirement extraction",
      "Structured output with section mapping",
      "Compliance matrix generation",
      "Links parsed requirements to compliance tracking",
    ],
    tips: [
      "Upload the full RFP document for best results",
      "Review AI-extracted requirements before accepting",
      "Parsed requirements flow into the Compliance page automatically",
    ],
  },
  {
    id: "compliance",
    title: "Compliance",
    icon: "\u{1F4CB}",
    group: "Capture",
    description:
      "Track compliance requirements against your proposal. Shows requirement-by-requirement status with section references and compliance notes.",
    features: [
      "Requirement checklist with status tracking",
      "Section reference mapping",
      "Compliance notes and evidence links",
      "Summary statistics for overall compliance",
    ],
    tips: [
      "Use this alongside the RFP Shredder output to ensure full coverage",
      "Mark each requirement as Compliant, Partial, or Non-Compliant",
    ],
  },
  {
    id: "color-review",
    title: "Color Review",
    icon: "\u{1F3A8}",
    group: "Capture",
    description:
      "AI-powered proposal review following the Shipley color team methodology. Upload proposal documents and get automated Blue, Pink, Red, Gold, and White team assessments grouped by opportunity.",
    features: [
      "Full Shipley color sequence: Blue \u2192 Pink \u2192 Red \u2192 Gold \u2192 White",
      "Accordion view grouped by opportunity",
      "Blue Team: 8-category fit assessment (PASS/WARN per category)",
      "Pink Team: outline and storyboard compliance",
      "Red Team: technical accuracy and responsiveness",
      "Gold Team: cost/price competitiveness",
      "White Team: format, compliance, and final review",
      "Black Hat: competitor threat analysis",
      "Score bar with reviewer breakdown",
      "Document upload for real AI-powered reviews",
    ],
    tips: [
      "Upload your proposal docs to get AI-driven color reviews",
      "Each opportunity shows all reviews conducted across all color phases",
      "Use the phase filter to focus on specific review types",
      "GO/NO-GO decisions are summarized in the header strip",
    ],
  },
  // Intelligence
  {
    id: "intel",
    title: "Intel Hub",
    icon: "\u{1F50D}",
    group: "Intelligence",
    description:
      "Your intelligence command center with AI-curated briefings, alerts, competitive intel, and action items.",
    features: [
      "Morning Briefing with AI-generated summaries",
      "Alert feed with criticality levels",
      "Competitive intelligence tracking",
      "Action items with due dates and priority",
      "Intel feed with source attribution",
    ],
    tips: [
      "Check the Morning Briefing at the start of each day",
      "Action items link to relevant opportunities when applicable",
    ],
  },
  {
    id: "predictive",
    title: "Predictive Analytics",
    icon: "\u{1F9E0}",
    group: "Intelligence",
    description:
      "AI/ML predictions for win probability, revenue forecasts, and bid/no-bid recommendations at the portfolio level.",
    features: [
      "Portfolio-level Pwin analysis",
      "Revenue forecast modeling",
      "Bid/No-Bid recommendation engine",
      "Trend analysis across pipeline",
    ],
    tips: [
      "Per-opportunity Pwin also shows on each opportunity detail page",
      "Use this for portfolio-level strategy decisions",
    ],
  },
  {
    id: "anomaly",
    title: "Anomaly Detection",
    icon: "\u{1F514}",
    group: "Intelligence",
    description:
      "Automated monitoring for unusual patterns in your data \u2014 sudden value changes, deadline shifts, or status anomalies.",
    features: [
      "Real-time anomaly monitoring",
      "Configurable alert thresholds",
      "Historical pattern analysis",
      "Integration with notification system",
    ],
    tips: [
      "Review anomalies regularly to catch issues early",
      "Adjust thresholds in Settings if you get too many false positives",
    ],
  },
  {
    id: "contacts",
    title: "Contacts",
    icon: "\u{1F464}",
    group: "Intelligence",
    description:
      "Manage your contacts and relationships across opportunities. Track government POCs, teaming partners, and key stakeholders.",
    features: [
      "Contact database with role and organization",
      "Relationship mapping to opportunities",
      "Communication history tracking",
      "Search and filter by role, org, or opportunity",
    ],
    tips: [
      "Keep contacts linked to their relevant opportunities for better intel",
    ],
  },
  {
    id: "knowledge",
    title: "Knowledge Base",
    icon: "\u{1F4DA}",
    group: "Intelligence",
    description:
      "Upload and search documents using AI-powered semantic search (pgvector). Store past proposals, lessons learned, and reference materials.",
    features: [
      "Document upload with AI embedding generation",
      "Semantic search across all documents",
      "Category and tag organization",
      "Version tracking for documents",
    ],
    tips: [
      "Upload past proposals and win/loss reports to build your knowledge base",
      "Use natural language queries \u2014 the search understands meaning, not just keywords",
    ],
  },
  {
    id: "cpars",
    title: "CPARS Builder",
    icon: "\u{1F4CA}",
    group: "Intelligence",
    description:
      "Build CPARS (Contractor Performance Assessment Reporting System) narratives with AI assistance. Generate professional performance narratives from your project data.",
    features: [
      "AI-generated CPARS narratives",
      "Template-based structure",
      "Performance rating guidance",
      "Export-ready formatting",
    ],
    tips: [
      "Provide detailed project data for better AI-generated narratives",
      "Review and customize AI output before final submission",
    ],
  },
  // Reporting
  {
    id: "financials",
    title: "Financials",
    icon: "\u{1F4B0}",
    group: "Reporting",
    description:
      "Financial tracking and reporting. View orders, sales, EBIT, margins, and backlog data. Upload financial documents to build out your financial picture.",
    features: [
      "Key financial metrics dashboard",
      "Document upload for financial data extraction",
      "Historical trend tracking",
      "Export capabilities",
    ],
    tips: [
      "Upload financial docs to have AI extract and organize the data",
      "Financial KPIs feed the strip at the top of every page",
    ],
  },
  {
    id: "reports",
    title: "Reports",
    icon: "\u{1F4D1}",
    group: "Reporting",
    description:
      "Generate and view reports across your pipeline, capture activities, and financial performance.",
    features: [
      "Pre-built report templates",
      "Custom date range filtering",
      "Export to CSV and PDF",
      "Scheduled report generation",
    ],
    tips: [
      "Use the date range filter to focus on specific periods",
    ],
  },
  {
    id: "discussions",
    title: "Discussions",
    icon: "\u{1F4AC}",
    group: "Reporting",
    description:
      "Team collaboration space. Post updates, ask questions, and share insights related to opportunities and capture activities.",
    features: [
      "Threaded discussions",
      "Tag team members",
      "Link to opportunities and documents",
      "Search and filter conversations",
    ],
    tips: [
      "Use discussions to capture decisions and rationale for future reference",
    ],
  },
  // Admin
  {
    id: "settings",
    title: "Settings",
    icon: "\u26A1",
    group: "Admin",
    description:
      "System configuration hub. Manage environment info, connectors (n8n, SAM.gov, FPDS), feature flags, and data feed schedules.",
    features: [
      "Environment status display",
      "n8n workflow engine connection management",
      "Data feed configuration (SAM.gov, FPDS, GovWin, GovTribe)",
      "Feature flag toggles",
      "System health overview",
    ],
    tips: [
      "Check the environment status after deployments to verify everything is connected",
      "Configure data feed intervals based on your update frequency needs",
    ],
  },
  {
    id: "health",
    title: "Health (QA Center)",
    icon: "\u{1F9EA}",
    group: "Admin",
    description:
      "System health monitoring. Run diagnostics on API endpoints, database connections, and n8n workflow integrations.",
    features: [
      "Endpoint health checks",
      "Database connectivity verification",
      "n8n workflow status monitoring",
      "Response time tracking",
    ],
    tips: [
      "Run health checks after deployments or when issues are reported",
    ],
  },
  {
    id: "workflows",
    title: "Workflows",
    icon: "\u2699",
    group: "Admin",
    description:
      "View and manage n8n workflow integrations. See which workflows are active, their last execution status, and trigger types.",
    features: [
      "Workflow list with status indicators",
      "Last execution status and timing",
      "Direct link to n8n for editing",
      "Graceful fallback when n8n is unavailable",
    ],
    tips: [
      "If you see 'Failed to load workflows', check your n8n connection in Settings",
    ],
  },
  {
    id: "users",
    title: "Users",
    icon: "\u{1F465}",
    group: "Admin",
    description:
      "User management with role-based access control (RBAC). 5 built-in roles: Administrator, BD Manager, Capture Manager, Analyst, and Viewer.",
    features: [
      "User listing with role assignments",
      "5 permission levels with granular access",
      "Active/inactive status management",
      "Role-based page and action restrictions",
    ],
    tips: [
      "Viewers can see data but cannot modify anything",
      "Administrators have full access to all features and settings",
    ],
  },
  {
    id: "audit-log",
    title: "Audit Log",
    icon: "\u{1F4DC}",
    group: "Admin",
    description:
      "Complete audit trail of all system actions. Tracks who did what, when, and on which resource. Auto-logged for all write operations.",
    features: [
      "Automatic logging of all write operations",
      "User, action, resource, and timestamp tracking",
      "Search and filter by user, action type, or date",
      "Exportable audit data",
    ],
    tips: [
      "Use the audit log to track approval decisions and data changes",
      "Filter by user to see all actions by a specific team member",
    ],
  },
  {
    id: "doctrine",
    title: "Doctrine",
    icon: "\u{1F4D6}",
    group: "Admin",
    description:
      "Manage organizational doctrine documents \u2014 Book of Truths, Sprint Notes, Decision Logs, and Master Build Notes.",
    features: [
      "4 document types with distinct workflows",
      "Sprint-based organization",
      "Finalization and publishing pipeline",
      "Gate check verification before publish",
    ],
    tips: [
      "Use the Book of Truths for canonical reference data",
      "Sprint Notes capture decisions and progress per sprint",
    ],
  },
  {
    id: "prompts",
    title: "Prompt Architect",
    icon: "\u{1F4DD}",
    group: "Admin",
    description:
      "Build structured, reusable AI prompts from your ideas. Describe what you need in plain English and get a formatted prompt you can use in any AI tool.",
    features: [
      "Natural language to structured prompt conversion",
      "Template library for common use cases",
      "Version history for prompts",
      "Copy-to-clipboard for easy use in other tools",
    ],
    tips: [
      "Describe your idea in plain English and let the Prompt Architect structure it",
      "Save useful prompts as templates for reuse",
    ],
  },
];

const GROUPS = ["Operations", "Capture", "Intelligence", "Reporting", "Admin"];

const GROUP_COLORS: Record<string, string> = {
  Operations: "#3b82f6",
  Capture: "#8b5cf6",
  Intelligence: "#06b6d4",
  Reporting: "#f59e0b",
  Admin: "#6b7280",
};

const SHORTCUTS = [
  { keys: ["Ctrl", "K"], description: "Open global search" },
  { keys: ["Ctrl", "N"], description: "Quick Entry \u2014 add new opportunity" },
  { keys: ["Esc"], description: "Close modals and popovers" },
];

export default function UserManual() {
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<string>("");

  const filtered = PAGE_SECTIONS.filter((s) => {
    if (selectedGroup && s.group !== selectedGroup) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        s.title.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.features.some((f) => f.toLowerCase().includes(q)) ||
        s.tips.some((t) => t.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, color: "#fff" }}>
          User Manual
        </h1>
        <p style={{ color: "#9ca3af", marginTop: 6, fontSize: 14, lineHeight: 1.5 }}>
          Reference guide for every page and feature in GDA Command. Click any section to expand details, features, and tips.
        </p>
      </div>

      {/* Quick Reference Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            background: "#161b22",
            border: "1px solid #30363d",
            borderRadius: 8,
            padding: 16,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#8b949e", marginBottom: 6 }}>
            Total Pages
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#fff" }}>
            {PAGE_SECTIONS.length}
          </div>
        </div>
        <div
          style={{
            background: "#161b22",
            border: "1px solid #30363d",
            borderRadius: 8,
            padding: 16,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#8b949e", marginBottom: 6 }}>
            Nav Groups
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#fff" }}>
            {GROUPS.length}
          </div>
        </div>
        <div
          style={{
            background: "#161b22",
            border: "1px solid #30363d",
            borderRadius: 8,
            padding: 16,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#8b949e", marginBottom: 6 }}>
            Keyboard Shortcuts
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#fff" }}>
            {SHORTCUTS.length}
          </div>
        </div>
      </div>

      {/* Keyboard Shortcuts */}
      <div
        style={{
          background: "#161b22",
          border: "1px solid #30363d",
          borderRadius: 8,
          padding: 16,
          marginBottom: 24,
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 700, color: "#fff", margin: "0 0 12px 0" }}>
          Keyboard Shortcuts
        </h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
          {SHORTCUTS.map((s) => (
            <div key={s.description} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ display: "flex", gap: 4 }}>
                {s.keys.map((k) => (
                  <kbd
                    key={k}
                    style={{
                      display: "inline-block",
                      padding: "2px 8px",
                      fontSize: 12,
                      fontFamily: "monospace",
                      background: "#0d1117",
                      border: "1px solid #30363d",
                      borderRadius: 4,
                      color: "#e5e5e5",
                    }}
                  >
                    {k}
                  </kbd>
                ))}
              </div>
              <span style={{ fontSize: 13, color: "#9ca3af" }}>{s.description}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Search & Filter */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="Search pages, features, or tips..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1,
            minWidth: 200,
            padding: "8px 12px",
            background: "#0d1117",
            border: "1px solid #30363d",
            borderRadius: 6,
            color: "#e5e5e5",
            fontSize: 14,
            outline: "none",
          }}
        />
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={() => setSelectedGroup("")}
            style={{
              padding: "6px 14px",
              borderRadius: 6,
              border: "1px solid #30363d",
              background: !selectedGroup ? "#238636" : "#21262d",
              color: "#fff",
              fontSize: 13,
              cursor: "pointer",
              fontWeight: !selectedGroup ? 600 : 400,
            }}
          >
            All
          </button>
          {GROUPS.map((g) => (
            <button
              key={g}
              onClick={() => setSelectedGroup(selectedGroup === g ? "" : g)}
              style={{
                padding: "6px 14px",
                borderRadius: 6,
                border: `1px solid ${selectedGroup === g ? GROUP_COLORS[g] : "#30363d"}`,
                background: selectedGroup === g ? GROUP_COLORS[g] + "22" : "#21262d",
                color: selectedGroup === g ? GROUP_COLORS[g] : "#9ca3af",
                fontSize: 13,
                cursor: "pointer",
                fontWeight: selectedGroup === g ? 600 : 400,
              }}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {/* Page Sections */}
      {GROUPS.filter((g) => !selectedGroup || g === selectedGroup).map((group) => {
        const groupPages = filtered.filter((s) => s.group === group);
        if (groupPages.length === 0) return null;
        return (
          <div key={group} style={{ marginBottom: 28 }}>
            <h2
              style={{
                fontSize: 14,
                fontWeight: 700,
                textTransform: "uppercase",
                color: GROUP_COLORS[group],
                marginBottom: 12,
                letterSpacing: "0.05em",
                borderBottom: `2px solid ${GROUP_COLORS[group]}33`,
                paddingBottom: 6,
              }}
            >
              {group}
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {groupPages.map((section) => {
                const isExpanded = expandedSection === section.id;
                return (
                  <div
                    key={section.id}
                    style={{
                      background: "#161b22",
                      border: `1px solid ${isExpanded ? GROUP_COLORS[group] + "66" : "#30363d"}`,
                      borderRadius: 8,
                      overflow: "hidden",
                      transition: "border-color 0.2s",
                    }}
                  >
                    <button
                      onClick={() => setExpandedSection(isExpanded ? null : section.id)}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "14px 16px",
                        background: "transparent",
                        border: "none",
                        color: "#fff",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <span style={{ fontSize: 22 }}>{section.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 15, fontWeight: 600 }}>
                          {section.title}
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            color: "#8b949e",
                            marginTop: 2,
                            lineHeight: 1.4,
                          }}
                        >
                          {section.description.slice(0, 120)}
                          {section.description.length > 120 && !isExpanded ? "..." : ""}
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: 18,
                          color: "#6b7280",
                          transform: isExpanded ? "rotate(90deg)" : "rotate(0)",
                          transition: "transform 0.2s",
                        }}
                      >
                        {"\u25B6"}
                      </span>
                    </button>
                    {isExpanded && (
                      <div
                        style={{
                          padding: "0 16px 16px",
                          borderTop: "1px solid #21262d",
                        }}
                      >
                        <div style={{ marginTop: 14 }}>
                          <div
                            style={{
                              fontSize: 13,
                              color: "#c9d1d9",
                              lineHeight: 1.6,
                              marginBottom: 16,
                            }}
                          >
                            {section.description}
                          </div>
                          <div style={{ marginBottom: 16 }}>
                            <div
                              style={{
                                fontSize: 12,
                                fontWeight: 700,
                                textTransform: "uppercase",
                                color: GROUP_COLORS[group],
                                marginBottom: 8,
                              }}
                            >
                              Features
                            </div>
                            <ul
                              style={{
                                margin: 0,
                                paddingLeft: 20,
                                display: "flex",
                                flexDirection: "column",
                                gap: 4,
                              }}
                            >
                              {section.features.map((f, i) => (
                                <li
                                  key={i}
                                  style={{ fontSize: 13, color: "#c9d1d9", lineHeight: 1.5 }}
                                >
                                  {f}
                                </li>
                              ))}
                            </ul>
                          </div>
                          {section.tips.length > 0 && (
                            <div
                              style={{
                                background: "#0d1117",
                                borderRadius: 6,
                                padding: 12,
                                border: "1px solid #30363d",
                              }}
                            >
                              <div
                                style={{
                                  fontSize: 12,
                                  fontWeight: 700,
                                  textTransform: "uppercase",
                                  color: "#f59e0b",
                                  marginBottom: 8,
                                }}
                              >
                                Tips
                              </div>
                              <ul
                                style={{
                                  margin: 0,
                                  paddingLeft: 20,
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: 4,
                                }}
                              >
                                {section.tips.map((t, i) => (
                                  <li
                                    key={i}
                                    style={{
                                      fontSize: 13,
                                      color: "#9ca3af",
                                      lineHeight: 1.5,
                                    }}
                                  >
                                    {t}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {filtered.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: 48,
            color: "#6b7280",
            fontSize: 15,
          }}
        >
          No pages match your search. Try a different term.
        </div>
      )}

      {/* Footer */}
      <div
        style={{
          marginTop: 32,
          padding: "16px 0",
          borderTop: "1px solid #21262d",
          textAlign: "center",
          color: "#6b7280",
          fontSize: 12,
        }}
      >
        GDA Command v2 &mdash; User Manual &mdash; Last updated{" "}
        {new Date().toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })}
      </div>
    </div>
  );
}
