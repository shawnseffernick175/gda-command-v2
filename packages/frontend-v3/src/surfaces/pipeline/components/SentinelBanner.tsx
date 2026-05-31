export function SentinelBanner() {
  return (
    <div
      className="rounded-sm border-l-4 border-l-accent border border-border bg-surface-raised px-4 py-3 text-sm text-ink-primary"
      role="alert"
      data-testid="sentinel-banner"
    >
      Only add partners we are actively teaming with. No speculative partner entries.
    </div>
  );
}
