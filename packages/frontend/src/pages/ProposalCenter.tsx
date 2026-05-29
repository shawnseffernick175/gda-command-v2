import { useState } from "react";
import RFPShredder from "./RFPShredder";
import Compliance from "./Compliance";
import ColorReview from "./ColorReview";

type Tab = "shredder" | "compliance" | "color-review";

const TABS: { key: Tab; label: string; icon: string; description: string }[] = [
  { key: "shredder", label: "RFP Shredder", icon: "✂", description: "Extract and analyze requirements from solicitation documents" },
  { key: "compliance", label: "Compliance Matrix", icon: "📋", description: "Track compliance status for all solicitation requirements" },
  { key: "color-review", label: "Color Review", icon: "🎨", description: "Shipley color team review sequence (Blue → Gold)" },
];

export default function ProposalCenter() {
  const [activeTab, setActiveTab] = useState<Tab>("shredder");

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
        <h1 style={{ margin: 0 }}>Proposal Center</h1>
        <span style={{
          fontSize: 11,
          padding: "2px 8px",
          borderRadius: 4,
          background: "#1e3a5f",
          color: "#60a5fa",
        }}>
          Consolidated
        </span>
      </div>
      <p style={{ fontSize: 13, color: "var(--color-text-muted)", marginBottom: 16, marginTop: 0 }}>
        {TABS.find((t) => t.key === activeTab)?.description}
      </p>

      {/* Tab bar */}
      <div style={{
        display: "flex",
        gap: 0,
        borderBottom: "2px solid var(--color-border)",
        marginBottom: 20,
      }}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: "10px 20px",
              background: "transparent",
              border: "none",
              borderBottom: activeTab === tab.key ? "2px solid #01696F" : "2px solid transparent",
              marginBottom: -2,
              color: activeTab === tab.key ? "#01696F" : "var(--color-text-muted)",
              fontWeight: activeTab === tab.key ? 700 : 500,
              fontSize: 14,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              transition: "all 0.15s",
            }}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === "shredder" && <RFPShredder />}
        {activeTab === "compliance" && <Compliance />}
        {activeTab === "color-review" && <ColorReview />}
      </div>
    </div>
  );
}
