interface ExclusionBannerProps {
  exclusionHits: string[];
}

export function ExclusionBanner({ exclusionHits }: ExclusionBannerProps) {
  if (exclusionHits.length === 0) return null;

  return (
    <div className="border-l-4 border-critical bg-surface rounded-sm p-4">
      <div className="flex items-start gap-3">
        <div>
          <p className="text-sm font-semibold text-critical">
            Executive Override Required
          </p>
          <p className="text-sm text-ink-muted mt-1">
            {exclusionHits.length} exclusion{exclusionHits.length > 1 ? 's' : ''} triggered.
            This document has been flagged for executive review before proceeding.
          </p>
          <div className="flex gap-2 mt-2 flex-wrap">
            {exclusionHits.map((hit) => (
              <span
                key={hit}
                className="inline-flex items-center px-2 py-0.5 text-xs font-medium border border-critical text-critical rounded-sm"
              >
                {hit}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
