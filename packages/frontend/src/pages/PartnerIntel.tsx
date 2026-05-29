import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { authenticatedFetch } from "../api/auth";
import SourceBadge from "../components/SourceBadge";
import type { SourceRef } from "../components/opportunity/FieldWithSource";

interface PartnerProfile {
  ou_tag: string;
  last_synced_at: string | null;
  certs: Cert[];
  vehicles: Vehicle[];
  products: Product[];
  why_track: WhyTrack;
  display_name: string;
  anchor_company: string;
  uei: string | null;
  cage: string | null;
  primary_naics: string | null;
  ou_notes: string | null;
}

interface Cert {
  name: string;
  expiration: string | null;
  status: string;
}

interface Vehicle {
  name: string;
  contract_number: string | null;
  ceiling: string | null;
  notes: string | null;
}

interface Product {
  name: string;
  description: string;
}

interface WhyTrack {
  teaming_levers: string[];
  capacity_notes: string;
}

interface Award {
  id: number;
  partner_ou_tag: string;
  contract_id: string | null;
  contract_id_sources?: SourceRef[];
  customer: string | null;
  customer_sources?: SourceRef[];
  value: number | null;
  value_sources?: SourceRef[];
  awarded_at: string | null;
  awarded_at_sources?: SourceRef[];
  source: string;
}

interface NewsItem {
  id: number;
  partner_ou_tag: string;
  headline: string;
  url: string | null;
  source: string | null;
  published_at: string | null;
}

interface TeamingSummary {
  reason: string;
  suggested_partner: string;
  count: string;
}

function formatDateEST(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTimeEST(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }) + " EST";
}

function formatCurrency(v: number | null): string {
  if (v == null) return "—";
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

const PARTNER_CEO: Record<string, string> = {
  riverstone: "Angela Rittenbach",
  pd_systems: "N/A",
};

const PARTNER_HQ: Record<string, string> = {
  riverstone: "Huntsville, AL",
  pd_systems: "Springfield, VA",
};

const PARTNER_FOUNDED: Record<string, string> = {
  riverstone: "2007",
  pd_systems: "2007",
};

const PARTNER_FOCUS: Record<string, string> = {
  riverstone: "TechSIGINT, cyber engineering, mission software, classified DevSecOps",
  pd_systems: "XR/AR/VR, digital twins, LVC integration, immersive training, SERE, battlefield effects",
};

const PARTNER_ROLE: Record<string, string> = {
  riverstone: "Credibility, margin, valuation engine",
  pd_systems: "Innovation, differentiation, force multiplier",
};

const TEAMING_LEVER_CERTS = ["hubzone", "v3 veteran", "ic"];

function isTiCert(certName: string): boolean {
  return TEAMING_LEVER_CERTS.some((tc) => certName.toLowerCase().includes(tc));
}

const REASON_LABELS: Record<string, string> = {
  hubzone: "HUBZone",
  v3_veteran: "V3 Veteran",
  ic_clearance: "IC Clearance",
  training_depth: "Training Depth",
  scope_overflow: "Scope Overflow",
  de_confliction: "De-Confliction",
};

const REASON_DESCRIPTIONS: Record<string, (partner: string, count: number) => string> = {
  hubzone: (_p, n) => `Riverstone (HUBZone) unlocks set-aside bids. ${n} opp${n !== 1 ? "s" : ""} in queue with HUBZone set-aside.`,
  v3_veteran: (_p, n) => `PD Systems (V3 Veteran) strengthens veteran-preference bids. ${n} opp${n !== 1 ? "s" : ""}.`,
  ic_clearance: (_p, n) => `Riverstone (IC customer base) is the natural sub for IC-scope opps. ${n} opp${n !== 1 ? "s" : ""}.`,
  training_depth: (_p, n) => `PD Systems (300+ heads, XR/AR/VR) is the natural sub for training-scope opps. ${n} opp${n !== 1 ? "s" : ""}.`,
  scope_overflow: (_p, n) => `${n} opp${n !== 1 ? "s" : ""} flagged for scope overflow.`,
  de_confliction: (_p, n) => `${n} opp${n !== 1 ? "s" : ""} require de-confliction with partner activity.`,
};

const KIND_TO_SOURCE: Record<string, string> = {
  sam_gov: "sam.gov",
  fpds: "fpds",
  usaspending: "usaspending",
  govwin: "govwin",
  internal: "manual",
  news: "manual",
  doctrine: "manual",
  partner_site: "manual",
};

function InlineSources({ sources }: { sources: SourceRef[] }) {
  if (!sources || sources.length === 0) return null;
  if (sources.length === 1) {
    return (
      <a href={sources[0].url} target="_blank" rel="noopener noreferrer" title={sources[0].title}>
        <SourceBadge source={KIND_TO_SOURCE[sources[0].kind] ?? "manual"} hideManual={false} size="sm" />
      </a>
    );
  }
  const maxVisible = 3;
  if (sources.length <= maxVisible) {
    return (
      <span className="inline-flex items-center gap-1">
        {sources.map((s, i) => (
          <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" title={s.title}>
            <SourceBadge source={KIND_TO_SOURCE[s.kind] ?? "manual"} hideManual={false} size="sm" />
          </a>
        ))}
      </span>
    );
  }
  return (
    <SourceBadge
      source={`${sources.length} sources`}
      hideManual={false}
      size="sm"
      sources={sources}
    />
  );
}

function PartnerCard({ profile }: { profile: PartnerProfile }) {
  return (
    <div className="card p-6 mb-4">
      {/* Header */}
      <div className="mb-4">
        <h3 className="text-section font-semibold text-ink mb-1">{profile.anchor_company}</h3>
        <div className="flex flex-wrap gap-3 text-caption text-muted">
          <span>CEO: {PARTNER_CEO[profile.ou_tag] ?? "—"}</span>
          <span>HQ: {PARTNER_HQ[profile.ou_tag] ?? "—"}</span>
          <span>Founded: {PARTNER_FOUNDED[profile.ou_tag] ?? "—"}</span>
          {profile.cage && <span className="num">CAGE: {profile.cage}</span>}
          {profile.uei && <span className="num">UEI: {profile.uei}</span>}
        </div>
      </div>

      {/* Identity block */}
      <div className="mb-4">
        <h4 className="text-caption text-muted uppercase tracking-wider mb-2">Focus & Role</h4>
        <p className="text-body text-ink mb-1">{PARTNER_FOCUS[profile.ou_tag] ?? "—"}</p>
        <p className="text-caption text-muted italic">{PARTNER_ROLE[profile.ou_tag] ?? "—"}</p>
      </div>

      {/* Certification block */}
      <div className="mb-4">
        <h4 className="text-caption text-muted uppercase tracking-wider mb-2">Certifications</h4>
        <table className="w-full text-body">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left text-caption text-muted uppercase tracking-wider py-2 pr-3">Name</th>
              <th className="text-left text-caption text-muted uppercase tracking-wider py-2 pr-3">Status</th>
              <th className="text-left text-caption text-muted uppercase tracking-wider py-2">Expiration</th>
            </tr>
          </thead>
          <tbody>
            {profile.certs.map((c, i) => (
              <tr key={i} className="border-b border-border">
                <td className={`py-2 pr-3 ${isTiCert(c.name) ? "font-semibold" : ""}`}>{c.name}</td>
                <td className="py-2 pr-3 text-caption">{c.status}</td>
                <td className="py-2 text-caption num">{c.expiration ? formatDateEST(c.expiration) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Vehicle block */}
      <div className="mb-4">
        <h4 className="text-caption text-muted uppercase tracking-wider mb-2">Vehicles & IDIQs</h4>
        <table className="w-full text-body">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left text-caption text-muted uppercase tracking-wider py-2 pr-3">Name</th>
              <th className="text-left text-caption text-muted uppercase tracking-wider py-2 pr-3">Contract #</th>
              <th className="text-left text-caption text-muted uppercase tracking-wider py-2">Notes</th>
            </tr>
          </thead>
          <tbody>
            {profile.vehicles.map((v, i) => (
              <tr key={i} className="border-b border-border">
                <td className="py-2 pr-3">{v.name}</td>
                <td className="py-2 pr-3 text-caption num">{v.contract_number ?? "—"}</td>
                <td className="py-2 text-caption">{v.notes ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Products block */}
      <div className="mb-4">
        <h4 className="text-caption text-muted uppercase tracking-wider mb-2">Products</h4>
        {profile.products.map((p, i) => (
          <div key={i} className="mb-2">
            <span className="text-body text-ink font-medium">{p.name}</span>
            <span className="text-caption text-muted ml-2">{p.description}</span>
          </div>
        ))}
      </div>

      {/* Why Envision Tracks block */}
      <div>
        <h4 className="text-caption text-muted uppercase tracking-wider mb-2">Why Envision Tracks</h4>
        <ul className="list-disc list-inside text-body text-ink">
          {profile.why_track.teaming_levers?.map((lever, i) => (
            <li key={i}>{lever}</li>
          ))}
        </ul>
        {profile.why_track.capacity_notes && (
          <p className="text-caption text-muted mt-1 italic">{profile.why_track.capacity_notes}</p>
        )}
      </div>
    </div>
  );
}

export default function PartnerIntel() {
  const [searchParams] = useSearchParams();
  const newAwardsFilter = searchParams.get("new_awards");
  const [profiles, setProfiles] = useState<PartnerProfile[]>([]);
  const [awards, setAwards] = useState<Award[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [teamingSummary, setTeamingSummary] = useState<TeamingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [awardFilter, setAwardFilter] = useState("");
  const [newsFilter, setNewsFilter] = useState("");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [profilesRes, awardsRes, newsRes, summaryRes] = await Promise.all([
        authenticatedFetch("/api/partner-intel/profiles"),
        authenticatedFetch("/api/partner-intel/awards?per_page=50"),
        authenticatedFetch("/api/partner-intel/news?per_page=50"),
        authenticatedFetch("/api/partner-intel/teaming-summary"),
      ]);

      if (profilesRes.ok) {
        const body = await profilesRes.json();
        setProfiles(body.data?.profiles ?? []);
      }
      if (awardsRes.ok) {
        const body = await awardsRes.json();
        setAwards(body.data?.awards ?? []);
      }
      if (newsRes.ok) {
        const body = await newsRes.json();
        setNews(body.data?.items ?? []);
      }
      if (summaryRes.ok) {
        const body = await summaryRes.json();
        setTeamingSummary(body.data?.summary ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const filteredAwards = useMemo(() => {
    let result = awards;
    if (newAwardsFilter === "7d") {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 7);
      result = result.filter(
        (a) => a.awarded_at && new Date(a.awarded_at) >= cutoff,
      );
    }
    if (awardFilter) {
      result = result.filter((a) => a.partner_ou_tag === awardFilter);
    }
    return result;
  }, [awards, awardFilter, newAwardsFilter]);

  const filteredNews = newsFilter
    ? news.filter((n) => n.partner_ou_tag === newsFilter)
    : news;

  if (loading) {
    return (
      <div className="container-page">
        <p className="text-muted text-body">Loading…</p>
      </div>
    );
  }

  return (
    <div className="container-page">
      {/* Page header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-display font-semibold text-ink">Partner Intel</h1>
          <span className="inline-block rounded px-2 py-0.5 text-[11px] font-semibold border border-border text-muted">
            Tracked, not operated
          </span>
        </div>
        <p className="text-body text-muted">Teaming radar. Riverstone and PD Systems are tracked as intel, not operated.</p>
      </div>

      {/* Partner cards */}
      {profiles.map((profile) => (
        <PartnerCard key={profile.ou_tag} profile={profile} />
      ))}

      {/* Awards feed */}
      <div className="card p-6 mb-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-section font-semibold text-ink">Awards Feed</h3>
          <div className="flex items-center gap-3">
            <select
              value={awardFilter}
              onChange={(e) => setAwardFilter(e.target.value)}
              className="h-8 px-3 rounded border border-border text-body text-ink bg-white"
            >
              <option value="">All Partners</option>
              <option value="riverstone">Riverstone</option>
              <option value="pd_systems">PD Systems</option>
            </select>
            {profiles.length > 0 && (
              <span className="text-caption text-muted">
                Last synced: {formatTimeEST(profiles[0].last_synced_at)}
              </span>
            )}
          </div>
        </div>
        {filteredAwards.length === 0 ? (
          <p className="text-body text-muted">No awards data yet.</p>
        ) : (
          <table className="w-full text-body">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-caption text-muted uppercase tracking-wider py-2 pr-3">Partner</th>
                <th className="text-left text-caption text-muted uppercase tracking-wider py-2 pr-3">Contract ID</th>
                <th className="text-left text-caption text-muted uppercase tracking-wider py-2 pr-3">Customer</th>
                <th className="text-right text-caption text-muted uppercase tracking-wider py-2 pr-3">Value</th>
                <th className="text-left text-caption text-muted uppercase tracking-wider py-2 pr-3">Awarded</th>
                <th className="text-left text-caption text-muted uppercase tracking-wider py-2">Source</th>
              </tr>
            </thead>
            <tbody>
              {filteredAwards.map((a) => (
                <tr key={a.id} className="border-b border-border">
                  <td className="py-2 pr-3">{a.partner_ou_tag === "riverstone" ? "Riverstone" : "PD Systems"}</td>
                  <td className="py-2 pr-3 text-caption num">
                    <span className="inline-flex items-center gap-1">
                      {a.contract_id ?? "—"}
                      {a.contract_id_sources && <InlineSources sources={a.contract_id_sources} />}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    <span className="inline-flex items-center gap-1">
                      {a.customer ?? "—"}
                      {a.customer_sources && <InlineSources sources={a.customer_sources} />}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-right num">
                    <span className="inline-flex items-center gap-1 justify-end">
                      {formatCurrency(a.value)}
                      {a.value_sources && <InlineSources sources={a.value_sources} />}
                    </span>
                  </td>
                  <td className="py-2 pr-3 num">
                    <span className="inline-flex items-center gap-1">
                      {formatDateEST(a.awarded_at)}
                      {a.awarded_at_sources && <InlineSources sources={a.awarded_at_sources} />}
                    </span>
                  </td>
                  <td className="py-2 text-caption">{a.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* News feed */}
      <div className="card p-6 mb-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-section font-semibold text-ink">News Feed</h3>
          <select
            value={newsFilter}
            onChange={(e) => setNewsFilter(e.target.value)}
            className="h-8 px-3 rounded border border-border text-body text-ink bg-white"
          >
            <option value="">All Partners</option>
            <option value="riverstone">Riverstone</option>
            <option value="pd_systems">PD Systems</option>
          </select>
        </div>
        {filteredNews.length === 0 ? (
          <p className="text-body text-muted">No news items yet.</p>
        ) : (
          <div className="space-y-2">
            {filteredNews.map((item) => (
              <div key={item.id} className="flex items-center gap-3 py-2 border-b border-border">
                <span className="text-body text-ink flex-1">
                  {item.url ? (
                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">{item.headline}</a>
                  ) : (
                    item.headline
                  )}
                </span>
                <span className="text-caption text-muted shrink-0">{item.source ?? ""}</span>
                <span className="text-caption text-muted num shrink-0">{formatDateEST(item.published_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Teaming triggers section */}
      <div className="mb-4">
        <h3 className="text-section font-semibold text-ink mb-4">Teaming Triggers</h3>
        {teamingSummary.length === 0 ? (
          <p className="text-body text-muted">No teaming triggers yet. Qualify opportunities to generate flags.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {teamingSummary.map((s, i) => {
              const count = Number(s.count);
              const descFn = REASON_DESCRIPTIONS[s.reason];
              const desc = descFn ? descFn(s.suggested_partner, count) : `${count} opportunities flagged.`;
              return (
                <div key={i} className="card p-4 border-l-4 border-l-accent">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-body font-semibold text-ink">{REASON_LABELS[s.reason] ?? s.reason}</span>
                    <span className="inline-block rounded px-2 py-0.5 text-[11px] font-semibold border border-border text-muted num">{count}</span>
                  </div>
                  <p className="text-caption text-muted">{desc}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
