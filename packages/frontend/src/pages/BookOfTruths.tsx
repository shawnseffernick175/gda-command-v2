import { useEffect, useState, useRef } from "react";
import {
  fetchBookOfTruths,
  type BookOfTruthsData,
  type BookOfTruthsEntityRow,
  type BookOfTruthsGlossaryRow,
  type BookOfTruthsSourceRow,
} from "../api/client";

const CATEGORY_COLORS: Record<string, string> = {
  faq: "#3b82f6",
  policy: "#f59e0b",
  product: "#22c55e",
  goal: "#a855f7",
  knowledge: "#06b6d4",
  glossary: "#8b5cf6",
  source: "#ef4444",
};

const CATEGORY_ICONS: Record<string, string> = {
  faq: "\u2753",
  policy: "\u{1F4DC}",
  product: "\u{1F3E2}",
  goal: "\u{1F3AF}",
  knowledge: "\u{1F4DA}",
  glossary: "\u{1F4D6}",
  source: "\u{1F50C}",
};

const CATEGORY_LABELS: Record<string, string> = {
  faq: "FAQs & Troubleshooting",
  policy: "Policies & Procedures",
  product: "Product/Service Data",
  goal: "90-Day Blueprint",
  knowledge: "Knowledge Base",
  glossary: "Glossary",
  source: "Data Sources",
};

const MODULE_COLORS: Record<string, string> = {
  Operations: "#3b82f6",
  Capture: "#f59e0b",
  Intelligence: "#8b5cf6",
  Reporting: "#22c55e",
  Admin: "#6b7280",
};

const SOURCE_STATUS_COLORS: Record<string, string> = {
  active: "#22c55e",
  planned: "#3b82f6",
  deprecated: "#ef4444",
};

const SOURCE_TYPE_ICONS: Record<string, string> = {
  api: "\u{1F310}",
  database: "\u{1F5C4}",
  file: "\u{1F4C1}",
  webhook: "\u{26A1}",
  manual: "\u{270D}",
};

type ActiveTab = "faq" | "policy" | "product" | "goal" | "knowledge" | "glossary" | "sources";

export default function BookOfTruths() {
  const [data, setData] = useState<BookOfTruthsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<ActiveTab>("faq");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [moduleFilter, setModuleFilter] = useState("");
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    loadData(search);
  }, [moduleFilter]);

  function loadData(q?: string) {
    setLoading(true);
    const params: Record<string, string> = {};
    if (q) params.search = q;
    if (moduleFilter) params.module = moduleFilter;
    fetchBookOfTruths(params)
      .then((env) => {
        if (env.success && env.data) {
          setData(env.data);
          setError(null);
        } else {
          setError(env.error?.message ?? "Failed to load data dictionary");
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  function handleSearch(value: string) {
    setSearch(value);
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => loadData(value), 300);
  }

  const faqs = data?.entities.filter((e) => e.category === "faq") ?? [];
  const policies = data?.entities.filter((e) => e.category === "policy") ?? [];
  const products = data?.entities.filter((e) => e.category === "product") ?? [];
  const goals = data?.entities.filter((e) => e.category === "goal") ?? [];
  const knowledge = data?.entities.filter((e) => e.category === "knowledge") ?? [];
  const glossary = data?.glossary ?? [];
  const sources = data?.sources ?? [];

  const tabs: { key: ActiveTab; label: string; count: number; color: string }[] = [
    { key: "faq", label: "FAQs", count: faqs.length, color: CATEGORY_COLORS.faq },
    { key: "policy", label: "Policies", count: policies.length, color: CATEGORY_COLORS.policy },
    { key: "product", label: "Product Data", count: products.length, color: CATEGORY_COLORS.product },
    { key: "goal", label: "90-Day Goals", count: goals.length, color: CATEGORY_COLORS.goal },
    { key: "knowledge", label: "Knowledge Base", count: knowledge.length, color: CATEGORY_COLORS.knowledge },
    { key: "glossary", label: "Glossary", count: glossary.length, color: CATEGORY_COLORS.glossary },
    { key: "sources", label: "Sources", count: sources.length, color: CATEGORY_COLORS.source },
  ];

  function handlePrint() {
    window.print();
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#e4e4e7", margin: 0 }}>
            {"\u{1F4D6}"} Book of Truths
          </h1>
          <p style={{ color: "#9ca3af", fontSize: 13, margin: "4px 0 0" }}>
            Authoritative knowledge foundation &middot; {data ? `${faqs.length} FAQs \u2022 ${policies.length} Policies \u2022 ${products.length} Product \u2022 ${goals.length} Goals \u2022 ${knowledge.length} KB \u2022 ${glossary.length} Terms \u2022 ${sources.length} Sources` : "Loading\u2026"}
          </p>
        </div>
        <button
          onClick={handlePrint}
          style={{
            background: "#27272a",
            color: "#d4d4d8",
            border: "1px solid #3f3f46",
            borderRadius: 6,
            padding: "6px 14px",
            fontSize: 13,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {"\u{1F5A8}"} Export PDF
        </button>
      </div>

      {/* Summary Strip */}
      {data && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
            gap: 12,
            marginBottom: 20,
          }}
        >
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={{
                background: activeTab === t.key ? `${t.color}18` : "#18181b",
                border: `1px solid ${activeTab === t.key ? t.color : "#27272a"}`,
                borderRadius: 8,
                padding: "12px 16px",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1 }}>
                {CATEGORY_ICONS[t.key] ?? ""} {t.label}
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: t.color, marginTop: 4 }}>
                {t.count}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Search + Filter */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Search entities, rules, terms\u2026"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          style={{
            flex: 1,
            background: "#18181b",
            color: "#e4e4e7",
            border: "1px solid #27272a",
            borderRadius: 6,
            padding: "8px 12px",
            fontSize: 13,
          }}
        />
        {(activeTab !== "glossary" && activeTab !== "sources") && (
          <select
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            style={{
              background: "#18181b",
              color: "#e4e4e7",
              border: "1px solid #27272a",
              borderRadius: 6,
              padding: "8px 12px",
              fontSize: 13,
              minWidth: 140,
            }}
          >
            <option value="">All Modules</option>
            {(data?.modules ?? []).map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        )}
      </div>

      {/* Error / Loading */}
      {error && (
        <div style={{ background: "#7f1d1d", color: "#fca5a5", padding: 12, borderRadius: 6, marginBottom: 16 }}>
          {error}
        </div>
      )}
      {loading && (
        <div style={{ color: "#6b7280", textAlign: "center", padding: 40 }}>Loading data dictionary\u2026</div>
      )}

      {/* Tab Content */}
      {!loading && data && activeTab === "faq" && (
        <EntitiesTab entities={faqs} expandedId={expandedId} setExpandedId={setExpandedId} categoryColor={CATEGORY_COLORS.faq} />
      )}
      {!loading && data && activeTab === "policy" && (
        <EntitiesTab entities={policies} expandedId={expandedId} setExpandedId={setExpandedId} categoryColor={CATEGORY_COLORS.policy} />
      )}
      {!loading && data && activeTab === "product" && (
        <EntitiesTab entities={products} expandedId={expandedId} setExpandedId={setExpandedId} categoryColor={CATEGORY_COLORS.product} />
      )}
      {!loading && data && activeTab === "goal" && (
        <EntitiesTab entities={goals} expandedId={expandedId} setExpandedId={setExpandedId} categoryColor={CATEGORY_COLORS.goal} />
      )}
      {!loading && data && activeTab === "knowledge" && (
        <EntitiesTab entities={knowledge} expandedId={expandedId} setExpandedId={setExpandedId} categoryColor={CATEGORY_COLORS.knowledge} />
      )}
      {!loading && data && activeTab === "glossary" && (
        <GlossaryTab glossary={glossary} />
      )}
      {!loading && data && activeTab === "sources" && (
        <SourcesTab sources={sources} />
      )}
    </div>
  );
}

/* ===== Entities Tab ===== */
function EntitiesTab({
  entities,
  expandedId,
  setExpandedId,
  categoryColor = "#3b82f6",
}: {
  entities: BookOfTruthsEntityRow[];
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
  categoryColor?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {entities.map((entity) => {
        const isOpen = expandedId === entity.id;
        return (
          <div
            key={entity.id}
            style={{
              background: "#18181b",
              border: `1px solid ${isOpen ? categoryColor : "#27272a"}`,
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <button
              onClick={() => setExpandedId(isOpen ? null : entity.id)}
              style={{
                width: "100%",
                background: "transparent",
                border: "none",
                padding: "14px 16px",
                cursor: "pointer",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                textAlign: "left",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 18 }}>{"\u{1F4E6}"}</span>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#e4e4e7" }}>{entity.name}</div>
                  <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>{entity.description.slice(0, 100)}{entity.description.length > 100 ? "\u2026" : ""}</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    background: `${MODULE_COLORS[entity.module] ?? "#6b7280"}22`,
                    color: MODULE_COLORS[entity.module] ?? "#6b7280",
                    padding: "2px 8px",
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 500,
                  }}
                >
                  {entity.module}
                </span>
                <span style={{ color: "#6b7280", fontSize: 16, transition: "transform 0.15s", transform: isOpen ? "rotate(180deg)" : "rotate(0)" }}>
                  {"\u25BC"}
                </span>
              </div>
            </button>

            {/* Expanded Content */}
            {isOpen && (
              <div style={{ padding: "0 16px 16px", borderTop: "1px solid #27272a" }}>
                <p style={{ color: "#d4d4d8", fontSize: 13, margin: "12px 0" }}>{entity.description}</p>

                {/* Fields Table */}
                {entity.fields && entity.fields.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <h4 style={{ color: "#9ca3af", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, margin: "0 0 8px" }}>Fields ({entity.fields.length})</h4>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #27272a" }}>
                          <th style={{ textAlign: "left", padding: "6px 8px", color: "#6b7280", fontWeight: 500 }}>Name</th>
                          <th style={{ textAlign: "left", padding: "6px 8px", color: "#6b7280", fontWeight: 500 }}>Type</th>
                          <th style={{ textAlign: "center", padding: "6px 8px", color: "#6b7280", fontWeight: 500 }}>Required</th>
                          <th style={{ textAlign: "left", padding: "6px 8px", color: "#6b7280", fontWeight: 500 }}>Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {entity.fields.map((f) => (
                          <tr key={f.name} style={{ borderBottom: "1px solid #1e1e22" }}>
                            <td style={{ padding: "6px 8px", color: "#e4e4e7", fontFamily: "monospace" }}>{f.name}</td>
                            <td style={{ padding: "6px 8px", color: "#8b5cf6", fontFamily: "monospace" }}>{f.type}</td>
                            <td style={{ padding: "6px 8px", textAlign: "center", color: f.required ? "#22c55e" : "#6b7280" }}>
                              {f.required ? "\u2713" : "\u2013"}
                            </td>
                            <td style={{ padding: "6px 8px", color: "#9ca3af" }}>{f.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Rules */}
                {entity.rules && entity.rules.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <h4 style={{ color: "#9ca3af", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, margin: "0 0 8px" }}>Business Rules</h4>
                    <ul style={{ margin: 0, paddingLeft: 20 }}>
                      {entity.rules.map((r, i) => (
                        <li key={i} style={{ color: "#d4d4d8", fontSize: 12, marginBottom: 4 }}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Related / API */}
                <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                  {entity.related && entity.related.length > 0 && (
                    <div>
                      <h4 style={{ color: "#9ca3af", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, margin: "0 0 6px" }}>Related</h4>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {entity.related.map((r) => (
                          <span key={r} style={{ background: "#27272a", color: "#d4d4d8", padding: "2px 8px", borderRadius: 4, fontSize: 11 }}>{r}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {entity.api_endpoints && entity.api_endpoints.length > 0 && (
                    <div>
                      <h4 style={{ color: "#9ca3af", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, margin: "0 0 6px" }}>API Endpoints</h4>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        {entity.api_endpoints.map((ep) => (
                          <code key={ep} style={{ color: "#22c55e", fontSize: 11, fontFamily: "monospace" }}>{ep}</code>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
      {entities.length === 0 && (
        <div style={{ color: "#6b7280", textAlign: "center", padding: 30 }}>No entities match your search</div>
      )}
    </div>
  );
}

/* ===== Rules Tab ===== */
function RulesTab({
  rules,
  expandedId,
  setExpandedId,
}: {
  rules: BookOfTruthsEntityRow[];
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {rules.map((rule) => {
        const isOpen = expandedId === rule.id;
        return (
          <div
            key={rule.id}
            style={{
              background: "#18181b",
              border: `1px solid ${isOpen ? "#f59e0b" : "#27272a"}`,
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            <button
              onClick={() => setExpandedId(isOpen ? null : rule.id)}
              style={{
                width: "100%",
                background: "transparent",
                border: "none",
                padding: "14px 16px",
                cursor: "pointer",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                textAlign: "left",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 18 }}>{"\u{1F4DC}"}</span>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#e4e4e7" }}>{rule.name}</div>
                  <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>{rule.description.slice(0, 120)}{rule.description.length > 120 ? "\u2026" : ""}</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    background: `${MODULE_COLORS[rule.module] ?? "#6b7280"}22`,
                    color: MODULE_COLORS[rule.module] ?? "#6b7280",
                    padding: "2px 8px",
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 500,
                  }}
                >
                  {rule.module}
                </span>
                <span style={{ color: "#6b7280", fontSize: 16, transition: "transform 0.15s", transform: isOpen ? "rotate(180deg)" : "rotate(0)" }}>
                  {"\u25BC"}
                </span>
              </div>
            </button>
            {isOpen && (
              <div style={{ padding: "0 16px 16px", borderTop: "1px solid #27272a" }}>
                <p style={{ color: "#d4d4d8", fontSize: 13, margin: "12px 0" }}>{rule.description}</p>
                {rule.rules && rule.rules.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <h4 style={{ color: "#9ca3af", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, margin: "0 0 8px" }}>Rules</h4>
                    <ol style={{ margin: 0, paddingLeft: 20 }}>
                      {rule.rules.map((r, i) => (
                        <li key={i} style={{ color: "#d4d4d8", fontSize: 12, marginBottom: 6, lineHeight: 1.5 }}>{r}</li>
                      ))}
                    </ol>
                  </div>
                )}
                {rule.related && rule.related.length > 0 && (
                  <div>
                    <h4 style={{ color: "#9ca3af", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, margin: "0 0 6px" }}>Related Entities</h4>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {rule.related.map((r) => (
                        <span key={r} style={{ background: "#27272a", color: "#d4d4d8", padding: "2px 8px", borderRadius: 4, fontSize: 11 }}>{r}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
      {rules.length === 0 && (
        <div style={{ color: "#6b7280", textAlign: "center", padding: 30 }}>No rules match your search</div>
      )}
    </div>
  );
}

/* ===== Glossary Tab ===== */
function GlossaryTab({ glossary }: { glossary: BookOfTruthsGlossaryRow[] }) {
  const grouped = glossary.reduce<Record<string, BookOfTruthsGlossaryRow[]>>((acc, g) => {
    const cat = g.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(g);
    return acc;
  }, {});

  const categories = Object.keys(grouped).sort();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {categories.map((cat) => (
        <div key={cat}>
          <h3 style={{ color: "#8b5cf6", fontSize: 14, fontWeight: 600, margin: "0 0 8px", borderBottom: "1px solid #27272a", paddingBottom: 6 }}>
            {cat}
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {grouped[cat].map((g) => (
              <div key={g.id} style={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 6, padding: "10px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#e4e4e7" }}>{g.term}</span>
                  {g.acronym && (
                    <span style={{ background: "#8b5cf622", color: "#a78bfa", padding: "1px 6px", borderRadius: 3, fontSize: 11, fontWeight: 600 }}>
                      {g.acronym}
                    </span>
                  )}
                </div>
                <p style={{ color: "#d4d4d8", fontSize: 12, margin: "0 0 6px", lineHeight: 1.5 }}>{g.definition}</p>
                {g.related_entities.length > 0 && (
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {g.related_entities.map((r) => (
                      <span key={r} style={{ background: "#27272a", color: "#9ca3af", padding: "1px 6px", borderRadius: 3, fontSize: 10 }}>{r}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
      {glossary.length === 0 && (
        <div style={{ color: "#6b7280", textAlign: "center", padding: 30 }}>No terms match your search</div>
      )}
    </div>
  );
}

/* ===== Sources Tab ===== */
function SourcesTab({ sources }: { sources: BookOfTruthsSourceRow[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
      {sources.map((src) => (
        <div
          key={src.id}
          style={{
            background: "#18181b",
            border: "1px solid #27272a",
            borderRadius: 8,
            padding: 16,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18 }}>{SOURCE_TYPE_ICONS[src.type] ?? "\u{1F50C}"}</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#e4e4e7" }}>{src.name}</div>
                <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase" }}>{src.type}</div>
              </div>
            </div>
            <span
              style={{
                background: `${SOURCE_STATUS_COLORS[src.status]}22`,
                color: SOURCE_STATUS_COLORS[src.status],
                padding: "2px 8px",
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 500,
              }}
            >
              {src.status}
            </span>
          </div>
          <p style={{ color: "#d4d4d8", fontSize: 12, margin: "0 0 10px", lineHeight: 1.5 }}>{src.description}</p>
          {src.endpoint && (
            <div style={{ marginBottom: 8 }}>
              <span style={{ color: "#6b7280", fontSize: 10, textTransform: "uppercase" }}>Endpoint</span>
              <code style={{ display: "block", color: "#22c55e", fontSize: 11, fontFamily: "monospace", marginTop: 2, wordBreak: "break-all" }}>
                {src.endpoint}
              </code>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {src.entities_served.map((e) => (
                <span key={e} style={{ background: "#27272a", color: "#9ca3af", padding: "1px 6px", borderRadius: 3, fontSize: 10 }}>{e}</span>
              ))}
            </div>
            <span style={{ color: "#6b7280", fontSize: 10 }}>{src.refresh_frequency}</span>
          </div>
        </div>
      ))}
      {sources.length === 0 && (
        <div style={{ color: "#6b7280", textAlign: "center", padding: 30, gridColumn: "1 / -1" }}>No sources match your search</div>
      )}
    </div>
  );
}
