interface SourceLinkProps {
  url: string | null;
  label?: string;
}

export function SourceLink({ url, label = 'USAspending.gov' }: SourceLinkProps) {
  if (!url) {
    return <span className="text-ink-muted">—</span>;
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent hover:underline transition-colors"
      data-testid="source-link"
    >
      {label}
    </a>
  );
}
