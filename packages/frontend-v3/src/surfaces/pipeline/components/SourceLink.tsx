interface SourceLinkProps {
  url: string;
  label?: string;
}

export function SourceLink({ url, label }: SourceLinkProps) {
  const display = label ?? (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  })();

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-accent transition-colors"
      data-source-url={url}
      data-testid="source-link"
    >
      <span>{display}</span>
      <span className="text-ink-dim">&rarr;</span>
    </a>
  );
}
