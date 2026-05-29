import { useState, useEffect } from "react";
import { authenticatedFetch } from "../api/auth";

type TabKey = "envision" | "gda-narrative" | "partners";

const TABS: { key: TabKey; label: string }[] = [
  { key: "envision", label: "Envision" },
  { key: "gda-narrative", label: "GDA Narrative" },
  { key: "partners", label: "Partners" },
];

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="h-section mb-4">{children}</h3>
  );
}

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-1.5 border-b border-bg">
      <span className="text-[13px] text-muted min-w-[160px] shrink-0 font-medium">{label}</span>
      <span className="text-body text-ink num">{value ?? "N/A"}</span>
    </div>
  );
}

function CertBadge({ name, expiration, status }: { name: string; expiration: string | null; status: string }) {
  const isExpiring = expiration && status === "expiring";
  const expDate = expiration ? new Date(expiration) : null;
  const daysLeft = expDate ? Math.ceil((expDate.getTime() - Date.now()) / 86400000) : null;
  const warn = daysLeft !== null && daysLeft < 90;

  if (warn) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded border border-critical text-[13px] text-critical num">
        {name}
        {isExpiring && expiration && (
          <span className="inline-block rounded px-2 py-0.5 text-[11px] font-semibold bg-critical text-white">
            EXPIRED {new Date(expiration).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric" }).toUpperCase()}
          </span>
        )}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded border border-border text-[13px] text-ink num">
      {name}
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
  if (!data) return <div className="text-muted text-body">Loading...</div>;

  return (
    <div className="flex flex-col gap-6">
      <div className="card">
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
      </div>

      <div className="card">
        <SectionTitle>Certifications</SectionTitle>
        <div className="flex flex-wrap gap-2 mb-4">
          {data.certs.map((cert) => (
            <CertBadge key={cert.name} {...cert} />
          ))}
        </div>
        {data.cio_sp3_status && (
          <div className="card border-l-4 border-l-critical p-4">
            <div className="text-[14px] font-semibold text-critical mb-1">
              CIO-SP3 SB/8(a): {data.cio_sp3_status.status}
            </div>
            <div className="text-[13px] text-ink">
              Expired {data.cio_sp3_status.expired_date} via {data.cio_sp3_status.via}. {data.cio_sp3_status.note}
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <SectionTitle>Top Vehicles</SectionTitle>
        <div className="flex flex-col gap-1">
          {data.top_vehicles.map((v) => (
            <div key={v} className="text-body text-ink py-1">{v}</div>
          ))}
        </div>
      </div>

      <div className="card">
        <SectionTitle>Primary Customers</SectionTitle>
        <div className="flex flex-wrap gap-2">
          {data.primary_customers.map((c) => (
            <span
              key={c}
              className="px-3 py-1 rounded border border-border text-[13px] text-ink"
            >
              {c}
            </span>
          ))}
        </div>
      </div>

      <div className="card">
        <SectionTitle>Financial Cadence</SectionTitle>
        <p className="m-0 text-body text-ink">{data.financial_cadence}</p>
      </div>
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
  if (!data) return <div className="text-muted text-body">Loading...</div>;

  return (
    <div className="flex flex-col gap-6">
      <div className="card border-l-4 border-l-accent p-4">
        <span className="text-[13px] text-accent font-medium">
          Use for upmarket proposal positioning.
        </span>
      </div>

      <div className="card">
        <SectionTitle>Identity</SectionTitle>
        <FieldRow label="Legal Name" value={data.identity.legal_name} />
        <FieldRow label="CEO" value={data.identity.ceo} />
        <FieldRow label="Purpose" value={data.identity.purpose} />
        <FieldRow label="Operating Identity" value={data.identity.operating_identity} />
        <FieldRow label="Market Positioning" value={data.identity.market_positioning} />
      </div>

      <div className="card">
        <SectionTitle>Three Pillars: Enable / Protect / Train</SectionTitle>
        <div className="flex flex-col gap-4">
          {data.pillars.map((p) => (
            <div key={p.number} className="p-4 bg-bg rounded">
              <div className="text-[16px] font-semibold text-ink mb-1">
                OU-{p.number}: {p.name} — {p.title}
              </div>
              <div className="text-[13px] text-muted mb-0.5">
                Anchor: {p.anchor_company}
              </div>
              <div className="text-[14px] text-ink">{p.focus}</div>
              <div className="doctrine-tag mt-1">
                Role: {p.role}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <SectionTitle>FY26-FY28 Financial Targets</SectionTitle>
        <div className="flex flex-col gap-0.5">
          {Object.entries(data.financials).map(([k, v]) => (
            <FieldRow key={k} label={k.replace(/_/g, " ").replace(/^fy/, "FY")} value={v} />
          ))}
        </div>
      </div>

      <div className="card">
        <SectionTitle>Phased Roadmap</SectionTitle>
        <div className="flex flex-col gap-3">
          {data.phased_roadmap.map((r) => (
            <div key={r.phase} className="p-4 bg-bg rounded">
              <div className="text-body font-semibold text-ink">
                {r.phase} ({r.year}) — {r.theme}
              </div>
              <div className="text-[14px] text-ink mt-1">{r.deliverables}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <SectionTitle>Positioning Paragraph</SectionTitle>
        <p className="m-0 text-body text-ink leading-relaxed">
          {data.positioning_paragraph}
        </p>
      </div>
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
  if (!partners) return <div className="text-muted text-body">Loading...</div>;

  return (
    <div className="flex flex-col gap-6">
      <div className="card text-[13px] text-muted">
        Tracked, not operated. These are teaming partners observed through the Partner Intel door. Full partner intel will be available in a future sprint.
      </div>

      {partners.map((p) => (
        <div key={p.ou_tag} className="card">
          <SectionTitle>{p.anchor_company}</SectionTitle>
          <FieldRow label="OU" value={p.display_name} />
          <FieldRow label="CAGE" value={p.cage} />
          <FieldRow label="UEI" value={p.uei ?? "TBD"} />
          {p.primary_naics && <FieldRow label="Primary NAICS" value={p.primary_naics} />}

          <div className="mt-4">
            <div className="text-[13px] font-medium text-muted mb-2">Certifications</div>
            <div className="flex flex-wrap gap-2">
              {p.certs.map((c) => (
                <span
                  key={c}
                  className="px-3 py-1 rounded border border-border text-[13px] text-ink"
                >
                  {c}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <div className="text-[13px] font-medium text-muted mb-2">Top Vehicles</div>
            <div className="flex flex-col gap-1">
              {p.top_vehicles.map((v) => (
                <div key={v} className="text-[14px] text-ink">{v}</div>
              ))}
            </div>
          </div>

          <div className="mt-4 p-3 bg-bg rounded">
            <div className="text-[13px] font-medium text-muted mb-1">Why Envision tracks them</div>
            <div className="text-[14px] text-ink">{p.why_envision_tracks}</div>
          </div>
        </div>
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
    <div className="container-page py-12">
      <h1 className="h-display mb-2">Company Profile</h1>
      <p className="doctrine-tag mb-8">
        Envision identity as primary truth. GDA 3-pillar narrative for proposals.
      </p>

      {/* Tab strip */}
      <div className="flex gap-4 mb-8 border-b border-border">
        {TABS.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`bg-transparent border-none pb-2 px-0 text-body cursor-pointer transition-colors duration-150 ${
                active
                  ? "font-semibold text-accent border-b-2 border-accent"
                  : "font-normal text-muted border-b-2 border-transparent"
              }`}
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
