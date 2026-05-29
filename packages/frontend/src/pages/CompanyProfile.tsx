import { useState, useEffect } from "react";
import { authenticatedFetch } from "../api/auth";

type TabKey = "envision" | "gda-narrative" | "partners";

const ACCENT = "#01696F";
const BG = "#F7F6F2";
const BORDER = "#D4D1CA";
const TEXT = "#28251D";
const TEXT_MUTED = "#6b7280";
const FONT = "Inter, system-ui, -apple-system, sans-serif";

const TABS: { key: TabKey; label: string }[] = [
  { key: "envision", label: "Envision" },
  { key: "gda-narrative", label: "GDA Narrative" },
  { key: "partners", label: "Partners" },
];

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 8,
        border: `1px solid ${BORDER}`,
        padding: 24,
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{ fontSize: 18, fontWeight: 600, color: TEXT, margin: "0 0 16px 0" }}>
      {children}
    </h3>
  );
}

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 12, padding: "6px 0", borderBottom: `1px solid ${BG}` }}>
      <span style={{ fontSize: 13, color: TEXT_MUTED, minWidth: 160, flexShrink: 0, fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 15, color: TEXT, fontFeatureSettings: '"tnum"' }}>{value ?? "N/A"}</span>
    </div>
  );
}

function CertBadge({ name, expiration, status }: { name: string; expiration: string | null; status: string }) {
  const isExpiring = expiration && status === "expiring";
  const expDate = expiration ? new Date(expiration) : null;
  const daysLeft = expDate ? Math.ceil((expDate.getTime() - Date.now()) / 86400000) : null;
  const warn = daysLeft !== null && daysLeft < 90;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 12px",
        borderRadius: 4,
        border: `1px solid ${warn ? "#dc2626" : BORDER}`,
        fontSize: 13,
        color: warn ? "#dc2626" : TEXT,
        background: warn ? "rgba(220,38,38,0.04)" : "#fff",
        fontFeatureSettings: '"tnum"',
      }}
    >
      {name}
      {isExpiring && expiration && (
        <span style={{ fontSize: 11, color: "#dc2626", fontWeight: 500 }}>
          exp {new Date(expiration).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "numeric", day: "numeric", year: "numeric" })}
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Envision Tab
// ---------------------------------------------------------------------------

interface EnvisionData {
  ou_tag: string;
  display_name: string;
  pillar: string;
  anchor_company: string;
  tool_role: string;
  focus: string;
  uei: string;
  cage: string;
  founded: string;
  hq: string;
  primary_naics: string;
  certs: { name: string; expiration: string | null; status: string }[];
  cio_sp3_status: { status: string; expired_date: string; via: string; note: string };
  top_vehicles: string[];
  primary_customers: string[];
  financial_cadence: string;
}

function EnvisionTab({ data }: { data: EnvisionData | null }) {
  if (!data) return <div style={{ color: TEXT_MUTED, fontSize: 15 }}>Loading...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <Card>
        <SectionTitle>Identity Card</SectionTitle>
        <FieldRow label="Anchor Company" value={data.anchor_company} />
        <FieldRow label="OU" value={data.display_name} />
        <FieldRow label="Pillar" value={data.pillar} />
        <FieldRow label="UEI" value={data.uei} />
        <FieldRow label="CAGE" value={data.cage} />
        <FieldRow label="Primary NAICS" value={data.primary_naics} />
        <FieldRow label="Founded" value={data.founded} />
        <FieldRow label="Headquarters" value={data.hq} />
        <FieldRow label="Focus" value={data.focus} />
        <FieldRow label="Tool Role" value={data.tool_role} />
      </Card>

      <Card>
        <SectionTitle>Certifications</SectionTitle>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          {data.certs.map((cert) => (
            <CertBadge key={cert.name} {...cert} />
          ))}
        </div>
        {data.cio_sp3_status && (
          <div
            style={{
              padding: 16,
              background: "rgba(220,38,38,0.04)",
              borderRadius: 8,
              border: "1px solid rgba(220,38,38,0.2)",
              borderLeft: "4px solid #dc2626",
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, color: "#dc2626", marginBottom: 4 }}>
              CIO-SP3 SB/8(a): {data.cio_sp3_status.status}
            </div>
            <div style={{ fontSize: 13, color: TEXT }}>
              Expired {data.cio_sp3_status.expired_date} via {data.cio_sp3_status.via}. {data.cio_sp3_status.note}
            </div>
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle>Top Vehicles</SectionTitle>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {data.top_vehicles.map((v) => (
            <div key={v} style={{ fontSize: 15, color: TEXT, padding: "4px 0" }}>{v}</div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle>Primary Customers</SectionTitle>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {data.primary_customers.map((c) => (
            <span
              key={c}
              style={{
                padding: "4px 12px",
                borderRadius: 4,
                border: `1px solid ${BORDER}`,
                fontSize: 13,
                color: TEXT,
              }}
            >
              {c}
            </span>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle>Financial Cadence</SectionTitle>
        <p style={{ margin: 0, fontSize: 15, color: TEXT }}>{data.financial_cadence}</p>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GDA Narrative Tab
// ---------------------------------------------------------------------------

interface NarrativeData {
  identity: { legal_name: string; purpose: string; operating_identity: string; market_positioning: string; ceo: string };
  pillars: { number: string; name: string; title: string; anchor_company: string; focus: string; role: string }[];
  financials: Record<string, string>;
  positioning_paragraph: string;
  phased_roadmap: { phase: string; year: string; theme: string; deliverables: string }[];
}

function NarrativeTab({ data }: { data: NarrativeData | null }) {
  if (!data) return <div style={{ color: TEXT_MUTED, fontSize: 15 }}>Loading...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div
        style={{
          padding: 16,
          background: "rgba(1,105,111,0.04)",
          borderRadius: 8,
          border: `1px solid rgba(1,105,111,0.2)`,
          fontSize: 13,
          color: ACCENT,
          fontWeight: 500,
        }}
      >
        Use for upmarket proposal positioning.
      </div>

      <Card>
        <SectionTitle>Identity</SectionTitle>
        <FieldRow label="Legal Name" value={data.identity.legal_name} />
        <FieldRow label="CEO" value={data.identity.ceo} />
        <FieldRow label="Purpose" value={data.identity.purpose} />
        <FieldRow label="Operating Identity" value={data.identity.operating_identity} />
        <FieldRow label="Market Positioning" value={data.identity.market_positioning} />
      </Card>

      <Card>
        <SectionTitle>Three Pillars: Enable / Protect / Train</SectionTitle>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {data.pillars.map((p) => (
            <div key={p.number} style={{ padding: 16, background: BG, borderRadius: 8 }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: TEXT, marginBottom: 4 }}>
                OU-{p.number}: {p.name} — {p.title}
              </div>
              <div style={{ fontSize: 13, color: TEXT_MUTED, marginBottom: 2 }}>
                Anchor: {p.anchor_company}
              </div>
              <div style={{ fontSize: 14, color: TEXT }}>{p.focus}</div>
              <div style={{ fontSize: 13, color: TEXT_MUTED, marginTop: 4, fontStyle: "italic" }}>
                Role: {p.role}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle>FY26-FY28 Financial Targets</SectionTitle>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {Object.entries(data.financials).map(([k, v]) => (
            <FieldRow key={k} label={k.replace(/_/g, " ").replace(/^fy/, "FY")} value={v} />
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle>Phased Roadmap</SectionTitle>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {data.phased_roadmap.map((r) => (
            <div key={r.phase} style={{ padding: 16, background: BG, borderRadius: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: TEXT }}>
                {r.phase} ({r.year}) — {r.theme}
              </div>
              <div style={{ fontSize: 14, color: TEXT, marginTop: 4 }}>{r.deliverables}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle>Positioning Paragraph</SectionTitle>
        <p style={{ margin: 0, fontSize: 15, color: TEXT, lineHeight: 1.6 }}>
          {data.positioning_paragraph}
        </p>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Partners Tab
// ---------------------------------------------------------------------------

interface Partner {
  ou_tag: string;
  display_name: string;
  anchor_company: string;
  cage: string | null;
  uei: string | null;
  primary_naics: string | null;
  read_only: boolean;
  why_envision_tracks: string;
  certs: string[];
  top_vehicles: string[];
}

function PartnersTab({ partners }: { partners: Partner[] | null }) {
  if (!partners) return <div style={{ color: TEXT_MUTED, fontSize: 15 }}>Loading...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div
        style={{
          padding: 16,
          background: BG,
          borderRadius: 8,
          border: `1px solid ${BORDER}`,
          fontSize: 13,
          color: TEXT_MUTED,
        }}
      >
        Tracked, not operated. These are teaming partners observed through the Partner Intel door. Full partner intel will be available in a future sprint.
      </div>

      {partners.map((p) => (
        <Card key={p.ou_tag}>
          <SectionTitle>{p.anchor_company}</SectionTitle>
          <FieldRow label="OU" value={p.display_name} />
          <FieldRow label="CAGE" value={p.cage} />
          <FieldRow label="UEI" value={p.uei ?? "TBD"} />
          {p.primary_naics && <FieldRow label="Primary NAICS" value={p.primary_naics} />}

          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: TEXT_MUTED, marginBottom: 8 }}>Certifications</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {p.certs.map((c) => (
                <span
                  key={c}
                  style={{
                    padding: "4px 12px",
                    borderRadius: 4,
                    border: `1px solid ${BORDER}`,
                    fontSize: 13,
                    color: TEXT,
                  }}
                >
                  {c}
                </span>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: TEXT_MUTED, marginBottom: 8 }}>Top Vehicles</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {p.top_vehicles.map((v) => (
                <div key={v} style={{ fontSize: 14, color: TEXT }}>{v}</div>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 16, padding: 12, background: BG, borderRadius: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: TEXT_MUTED, marginBottom: 4 }}>Why Envision tracks them</div>
            <div style={{ fontSize: 14, color: TEXT }}>{p.why_envision_tracks}</div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Company Profile Page
// ---------------------------------------------------------------------------

export default function CompanyProfile() {
  const [activeTab, setActiveTab] = useState<TabKey>("envision");
  const [envisionData, setEnvisionData] = useState<EnvisionData | null>(null);
  const [narrativeData, setNarrativeData] = useState<NarrativeData | null>(null);
  const [partnersData, setPartnersData] = useState<Partner[] | null>(null);

  useEffect(() => {
    async function fetchAll() {
      const [envRes, narRes, parRes] = await Promise.all([
        authenticatedFetch("/api/company-profile/envision"),
        authenticatedFetch("/api/company-profile/gda-narrative"),
        authenticatedFetch("/api/company-profile/partners"),
      ]);
      if (envRes.ok) {
        const b = await envRes.json();
        setEnvisionData(b?.data ?? null);
      }
      if (narRes.ok) {
        const b = await narRes.json();
        setNarrativeData(b?.data ?? null);
      }
      if (parRes.ok) {
        const b = await parRes.json();
        setPartnersData(b?.data?.partners ?? null);
      }
    }
    fetchAll();
  }, []);

  return (
    <div
      style={{
        maxWidth: 1280,
        margin: "0 auto",
        padding: "48px 32px",
        background: BG,
        minHeight: "100%",
        fontFamily: FONT,
      }}
    >
      <h1
        style={{
          fontSize: 32,
          fontWeight: 700,
          color: TEXT,
          margin: "0 0 8px 0",
        }}
      >
        Company Profile
      </h1>
      <p
        style={{
          margin: "0 0 32px 0",
          fontSize: 13,
          color: "#9ca3af",
          fontStyle: "italic",
        }}
      >
        Envision identity as primary truth. GDA 3-pillar narrative for proposals.
      </p>

      {/* Tab strip */}
      <div
        style={{
          display: "flex",
          gap: 0,
          marginBottom: 32,
          borderBottom: `1px solid ${BORDER}`,
        }}
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                background: "none",
                border: "none",
                borderBottom: isActive ? `2px solid ${ACCENT}` : "2px solid transparent",
                padding: "8px 24px",
                fontSize: 15,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? ACCENT : TEXT_MUTED,
                cursor: "pointer",
                fontFamily: FONT,
                transition: "color 0.15s, border-color 0.15s",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "envision" && <EnvisionTab data={envisionData} />}
      {activeTab === "gda-narrative" && <NarrativeTab data={narrativeData} />}
      {activeTab === "partners" && <PartnersTab partners={partnersData} />}
    </div>
  );
}
