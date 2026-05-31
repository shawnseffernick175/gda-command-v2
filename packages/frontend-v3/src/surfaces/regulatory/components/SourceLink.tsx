interface SourceLinkProps {
  href: string;
  label: string;
  secondary?: boolean;
  'data-testid'?: string;
}

export function SourceLink({ href, label, secondary, ...rest }: SourceLinkProps) {
  const testId = rest['data-testid'] ?? 'source-link';
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={
        secondary
          ? 'text-xs text-ink-muted hover:text-accent transition-colors'
          : 'text-ink-primary hover:text-accent transition-colors'
      }
      data-testid={testId}
    >
      {label}
    </a>
  );
}
