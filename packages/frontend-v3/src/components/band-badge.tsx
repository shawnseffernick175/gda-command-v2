"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Band } from "@/lib/types";

const BAND_STYLES: Record<Band, string> = {
  forecast: "bg-band-forecast/20 text-band-forecast border-band-forecast/40",
  signal: "bg-band-signal/20 text-band-signal border-band-signal/40",
  discovery: "bg-band-discovery/20 text-band-discovery border-band-discovery/40",
  pass: "bg-band-pass/20 text-band-pass border-band-pass/40",
};

const BAND_LABELS: Record<Band, string> = {
  forecast: "Forecast",
  signal: "Signal",
  discovery: "Discovery",
  pass: "Pass — insufficient lead time",
};

export function BandBadge({
  band,
  className,
}: {
  band: Band;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-mono text-xs",
        BAND_STYLES[band],
        band === "pass" && "opacity-60",
        className,
      )}
    >
      {BAND_LABELS[band]}
    </Badge>
  );
}
