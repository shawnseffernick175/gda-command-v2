import { Link, useLocation } from "react-router-dom";

const PATH_LABELS: Record<string, string> = {
  "/": "Launchpad",
  "/fast-track": "Fast Track",
  "/ops-tracker": "Ops Tracker",
  "/pipeline": "Pipeline",
  "/capture": "Capture Plans",
  "/approvals": "Approvals",
  "/rfp-shredder": "RFP Shredder",
  "/sam-monitor": "SAM.gov Monitor",
  "/fpds-monitor": "FPDS Monitor",
  "/intel": "Intel Hub",
  "/compliance": "Compliance",
  "/proposals": "Proposals",
  "/contacts": "Contacts",
  "/financial-bible": "Financials",
  "/reports": "Reports",
  "/knowledge": "Knowledge Base",
  "/predictive": "Predictive",
  "/color-review": "Color Review",
  "/anomaly": "Anomaly Detection",
  "/cpars": "CPARS Builder",
  "/govwin": "GovWin IQ",
  "/discussions": "Discussions",
  "/qa-center": "Health",
  "/doctrine": "Doctrine",
  "/book-of-truths": "Book of Truths",
  "/prompts": "Prompts",
  "/workflows": "Workflows",
  "/settings": "Settings",
};

const PATH_GROUPS: Record<string, string> = {
  "/fast-track": "Operations",
  "/ops-tracker": "Operations",
  "/pipeline": "Operations",
  "/approvals": "Operations",
  "/capture": "Capture",
  "/proposals": "Capture",
  "/rfp-shredder": "Capture",
  "/compliance": "Capture",
  "/color-review": "Capture",
  "/intel": "Intelligence",
  "/predictive": "Intelligence",
  "/anomaly": "Intelligence",
  "/contacts": "Intelligence",
  "/knowledge": "Intelligence",
  "/cpars": "Intelligence",
  "/govwin": "Intelligence",
  "/financial-bible": "Reporting",
  "/reports": "Reporting",
  "/discussions": "Reporting",
  "/settings": "Admin",
  "/qa-center": "Admin",
  "/workflows": "Admin",
  "/doctrine": "Admin",
  "/book-of-truths": "Admin",
  "/prompts": "Admin",
  "/sam-monitor": "Operations",
  "/fpds-monitor": "Operations",
};

export default function Breadcrumb() {
  const { pathname } = useLocation();

  if (pathname === "/") return null;

  // Match base path for detail pages like /opportunities/:id
  const basePath = "/" + pathname.split("/").filter(Boolean)[0];
  const matchedPath = PATH_LABELS[pathname] ? pathname : PATH_LABELS[basePath] ? basePath : null;
  if (!matchedPath) return null;

  const group = PATH_GROUPS[matchedPath];
  const label = PATH_LABELS[matchedPath];
  const isDetailPage = pathname !== matchedPath;

  return (
    <nav style={{
      fontSize: 12,
      color: "#9ca3af",
      marginBottom: 12,
      display: "flex",
      alignItems: "center",
      gap: 6,
    }}>
      <Link to="/" style={{ color: "#6b7280", textDecoration: "none" }}>Launchpad</Link>
      {group && (
        <>
          <span style={{ color: "#4b5563" }}>/</span>
          <span style={{ color: "#6b7280" }}>{group}</span>
        </>
      )}
      <span style={{ color: "#4b5563" }}>/</span>
      {isDetailPage ? (
        <>
          <Link to={matchedPath} style={{ color: "#6b7280", textDecoration: "none" }}>{label}</Link>
          <span style={{ color: "#4b5563" }}>/</span>
          <span style={{ color: "#9ca3af" }}>Detail</span>
        </>
      ) : (
        <span style={{ color: "#e4e4e7", fontWeight: 500 }}>{label}</span>
      )}
    </nav>
  );
}
