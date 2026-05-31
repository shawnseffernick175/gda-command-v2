interface SourceLinkProps {
  linkedRecordType: string | null;
  linkedRecordId: string | null;
  source: string;
}

function buildSourceUrl(type: string | null, id: string | null): string | null {
  if (!type || !id) return null;
  switch (type) {
    case 'opportunity': return `/opp/${id}`;
    case 'capture': return `/capture/${id}`;
    case 'pipeline': return `/pipeline?id=${id}`;
    default: return null;
  }
}

export function SourceLink({ linkedRecordType, linkedRecordId, source }: SourceLinkProps) {
  const url = buildSourceUrl(linkedRecordType, linkedRecordId);
  if (!url) {
    return <span className="text-xs text-ink-muted">{source}</span>;
  }
  return (
    <a
      href={url}
      data-source-url={url}
      className="text-xs text-accent hover:underline"
      target="_blank"
      rel="noopener noreferrer"
    >
      {linkedRecordType}
    </a>
  );
}
