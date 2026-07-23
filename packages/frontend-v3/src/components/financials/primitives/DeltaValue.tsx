import { cn } from "@/lib/utils";

/**
 * Sign-based delta / variance display.
 *
 * Positive → accessible green (`gda-green` #15803d), negative → red
 * (`gda-red` #dc2626), both WCAG-AA on the light surface. Colour is paired
 * with a ▲/▼ glyph so meaning is never conveyed by colour alone.
 *
 * `value` is the signed change; `null`/`undefined` renders a muted em-dash.
 */
export function DeltaValue({
  value,
  format,
  showArrow = true,
  className,
}: {
  value: number | null | undefined;
  /** Formats the *absolute* value; defaults to one-decimal percent. */
  format?: (abs: number) => string;
  showArrow?: boolean;
  className?: string;
}) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return (
      <span className={cn("tabular-nums text-muted-foreground", className)}>
        {"\u2014"}
      </span>
    );
  }

  const positive = value >= 0;
  const fmt = format ?? ((abs: number) => `${abs.toFixed(1)}%`);

  return (
    <span
      className={cn(
        "tabular-nums",
        positive ? "text-gda-green" : "text-gda-red",
        className,
      )}
    >
      {showArrow && (
        <span aria-hidden className="mr-0.5">
          {positive ? "\u25B2" : "\u25BC"}
        </span>
      )}
      {!showArrow && (positive ? "+" : "\u2212")}
      {fmt(Math.abs(value))}
    </span>
  );
}
