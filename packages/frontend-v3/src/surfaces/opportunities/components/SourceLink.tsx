import type { ReactNode } from 'react';
import type { SourceRef } from '../types';

interface SourceLinkProps {
  value: ReactNode;
  sources?: SourceRef[];
  'data-testid'?: string;
}

export function SourceLink({ value, sources, ...rest }: SourceLinkProps) {
  const sourceUrl = sources?.[0]?.url;
  const testId = rest['data-testid'] ?? 'source-link';

  if (sourceUrl) {
    return (
      <a
        href={sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-ink-primary hover:text-accent transition-colors"
        data-source-url={sourceUrl}
        data-testid={testId}
      >
        {value}
      </a>
    );
  }

  return (
    <span data-testid={testId}>
      {value}
    </span>
  );
}
