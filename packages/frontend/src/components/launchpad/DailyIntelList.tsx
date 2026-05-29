interface NewsItem {
  id: string | number;
  title: string;
  summary?: string;
  source?: string;
  url?: string;
  created_at: string;
}

interface DailyIntelListProps {
  items: NewsItem[];
  dateStr: string;
}

export default function DailyIntelList({ items, dateStr }: DailyIntelListProps) {
  if (items.length === 0) {
    return (
      <div
        style={{
          padding: 24,
          background: "#F7F6F2",
          borderRadius: 8,
          border: "1px solid #D4D1CA",
          color: "#6b7280",
          fontSize: 15,
          fontFamily: "Inter, system-ui, -apple-system, sans-serif",
        }}
      >
        No items ingested yet for {dateStr}. Auto-ingestion via news@gda.csr-llc.tech is active.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {items.map((item) => (
        <div
          key={item.id}
          style={{
            padding: 16,
            background: "#fff",
            borderRadius: 8,
            border: "1px solid #D4D1CA",
            boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
            fontFamily: "Inter, system-ui, -apple-system, sans-serif",
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 500, color: "#28251D", marginBottom: 4 }}>
            {item.url ? (
              <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ color: "#01696F", textDecoration: "none" }}>
                {item.title}
              </a>
            ) : (
              item.title
            )}
          </div>
          {item.summary && (
            <p style={{ margin: "4px 0 0 0", fontSize: 13, color: "#6b7280", lineHeight: 1.4 }}>
              {item.summary}
            </p>
          )}
          {item.source && (
            <span style={{ fontSize: 12, color: "#9ca3af", marginTop: 4, display: "inline-block" }}>
              {item.source}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
