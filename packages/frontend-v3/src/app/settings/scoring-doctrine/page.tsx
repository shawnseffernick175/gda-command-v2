"use client";

import { useScoringDoctrine } from "@/hooks/use-scoring-doctrine";
import { CollapseSection } from "@/components/shared/collapse-section";
import { PwinWeightsSection } from "@/components/settings/PwinWeightsSection";
import { PrinciplesSection } from "@/components/settings/PrinciplesSection";
import { RulesSection } from "@/components/settings/RulesSection";
import { WheelhouseSection } from "@/components/settings/WheelhouseSection";

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-12 animate-pulse rounded bg-gda-bg-base" />
      ))}
    </div>
  );
}

export default function ScoringDoctrinePage() {
  const { data, isLoading, error } = useScoringDoctrine();

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-20 bg-gda-bg-deep border-b border-border pb-3 pt-6 sticky-page-header">
        <h1 className="font-mono text-lg font-bold text-foreground">SCORING & DOCTRINE</h1>
        <p className="text-sm text-muted-foreground">
          Everything the tool uses to score, rank, and route opportunities.
        </p>
      </div>

      {error && (
        <div className="rounded border border-gda-red/30 bg-gda-red/10 px-4 py-3">
          <p className="text-xs text-gda-red">Failed to load config: {error.message}</p>
        </div>
      )}

      {/* Section 1: Pwin Scoring Weights */}
      <CollapseSection id="sd-pwin-weights" title="PWIN SCORING WEIGHTS" defaultOpen={true}>
        {isLoading || !data ? <LoadingSkeleton /> : (
          <PwinWeightsSection weights={data.pwin_weights} />
        )}
      </CollapseSection>

      {/* Section 2: Doctrine Principles */}
      <CollapseSection id="sd-principles" title="DOCTRINE PRINCIPLES" defaultOpen={false}>
        {isLoading || !data ? <LoadingSkeleton /> : (
          <PrinciplesSection principles={data.principles} />
        )}
      </CollapseSection>

      {/* Section 3: Doctrine Rules */}
      <CollapseSection id="sd-rules" title="DOCTRINE RULES" defaultOpen={false}>
        {isLoading || !data ? <LoadingSkeleton /> : (
          <RulesSection rules={data.rules} />
        )}
      </CollapseSection>

      {/* Section 4: Wheelhouse */}
      <CollapseSection id="sd-wheelhouse" title="WHEELHOUSE" defaultOpen={false}>
        {isLoading || !data ? <LoadingSkeleton /> : (
          <WheelhouseSection wheelhouse={data.wheelhouse} />
        )}
      </CollapseSection>
    </div>
  );
}
