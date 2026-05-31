/**
 * MarginFloorBanner — red banner when margin < 8% floor.
 * Cites the rule and links to the config row.
 */

interface MarginFloorBannerProps {
  marginPct: number | null;
  threshold: number;
  source: string;
}

export function MarginFloorBanner({ marginPct, threshold, source }: MarginFloorBannerProps) {
  if (marginPct === null || marginPct >= threshold) return null;

  return (
    <div
      className="rounded border border-l-4 border-l-critical border-border p-4 bg-surface"
      data-testid="margin-floor-banner"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-critical">
            Gross margin {marginPct}% is below the {threshold}% floor
          </p>
          <p className="text-xs text-ink-muted mt-1">
            Rule: <span className="font-mono">doctrine_rules_config.margin_floor_pct = {threshold}</span>
          </p>
          <p className="text-xs text-ink-muted">
            Source: {source === 'pricing_assumptions' ? 'Pricing assumptions' : source}
          </p>
        </div>
        <a
          href="/settings/doctrine"
          className="text-xs text-accent hover:underline whitespace-nowrap"
        >
          View config
        </a>
      </div>
    </div>
  );
}
