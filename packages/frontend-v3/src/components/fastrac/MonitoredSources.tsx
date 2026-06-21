"use client";

import {
  MONITORED_SOURCES,
  TOTAL_MONITORED_SOURCES,
  type SourceTierConfig,
} from "@/lib/fastrac-sources";
import { cn } from "@/lib/utils";

const TIER_ACCENT: Record<string, string> = {
  tier1: "bg-gda-green/15 border-gda-green/40 text-gda-green",
  tier2: "bg-gda-cyan/15 border-gda-cyan/40 text-gda-cyan",
};

function TierBlock({ tier }: { tier: SourceTierConfig }) {
  const count = tier.groups.reduce((g, grp) => g + grp.sources.length, 0);
  return (
    <div className="rounded border border-border bg-gda-panel/40 p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={cn(
            "rounded border px-2 py-0.5 text-[11px] font-mono font-medium uppercase",
            TIER_ACCENT[tier.tier],
          )}
        >
          {tier.label}
        </span>
        <span className="text-[11px] font-mono text-muted-foreground">
          {count} sources · {tier.cadence}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed">{tier.description}</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tier.groups.map((group) => (
          <div key={group.label} className="space-y-1.5">
            <p className="text-[11px] font-mono font-semibold text-foreground/80 uppercase tracking-wide">
              {group.label}
            </p>
            <ul className="space-y-1">
              {group.sources.map((s) => (
                <li key={s.name} className="text-[11px] leading-snug">
                  {s.url ? (
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gda-cyan hover:underline"
                    >
                      {s.name}
                    </a>
                  ) : (
                    <span className="text-foreground">{s.name}</span>
                  )}
                  <span className="text-muted-foreground"> — {s.mechanism}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MonitoredSources() {
  return (
    <div className="space-y-4">
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        FasTrac continuously monitors {TOTAL_MONITORED_SOURCES} DoD military
        innovation organizations for RFIs, Commercial Solutions Openings (CSOs),
        Broad Agency Announcements (BAAs), and prize challenges — the
        leading indicators that surface <span className="text-foreground">before</span> a
        formal sources-sought or SAM.gov solicitation posts. Sources are grouped
        by monitoring cadence.
      </p>
      {MONITORED_SOURCES.map((tier) => (
        <TierBlock key={tier.tier} tier={tier} />
      ))}
    </div>
  );
}
