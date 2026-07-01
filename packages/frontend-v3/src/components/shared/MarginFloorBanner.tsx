"use client";

import { useState } from "react";
import { DoctrineOverrideModal } from "@/components/shared/DoctrineOverrideModal";
import type { MarginCheck } from "@/hooks/use-doctrine-evaluation";

export function MarginFloorBanner({
  marginCheck,
  entityId,
  entityKind,
}: {
  marginCheck: MarginCheck;
  entityId: string;
  entityKind: string;
}) {
  const [showOverride, setShowOverride] = useState(false);

  if (marginCheck.passed || marginCheck.margin_pct == null) return null;

  return (
    <>
      <div className="rounded border-l-4 border-l-gda-red border border-gda-red/30 bg-gda-red/5 px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-gda-red">
            Margin Floor Violation
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Expected margin {marginCheck.margin_pct}% is below the {marginCheck.threshold}% minimum required for core lane pursuits.
            Source: {marginCheck.source}.
            Rule: <span className="font-mono">doctrine_rules_config.margin_floor_pct</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowOverride(true)}
          className="shrink-0 rounded border border-border px-2.5 py-1 text-[11px] font-mono text-muted-foreground hover:text-foreground hover:border-gda-green/40 transition-colors"
        >
          Override
        </button>
      </div>
      {showOverride && (
        <DoctrineOverrideModal
          entityId={entityId}
          entityKind={entityKind}
          kind="margin_override"
          onClose={() => setShowOverride(false)}
          onSuccess={() => setShowOverride(false)}
        />
      )}
    </>
  );
}
