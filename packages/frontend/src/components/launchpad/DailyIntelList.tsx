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
      <div className="card text-muted text-body">
        No items ingested yet for {dateStr}. Auto-ingestion via news@gda.csr-llc.tech is active.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => (
        <div key={item.id} className="card">
          <div className="text-body font-medium text-ink mb-1">
            {item.url ? (
              <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-accent no-underline hover:underline">
                {item.title}
              </a>
            ) : (
              item.title
            )}
          </div>
          {item.summary && (
            <p className="m-0 text-[13px] text-muted leading-snug mt-1">
              {item.summary}
            </p>
          )}
          {item.source && (
            <span className="caption mt-1 inline-block">
              {item.source}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
