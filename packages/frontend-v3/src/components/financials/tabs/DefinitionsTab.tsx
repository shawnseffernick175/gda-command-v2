"use client";

import { useDefinitions } from "@/hooks/use-financial-bible";
import { SourceFooter } from "@/components/financials/SourceFooter";

export function DefinitionsTab() {
  const { data, isLoading, error } = useDefinitions();

  if (isLoading) {
    return (
      <div className="text-sm text-muted-foreground">
        Loading definitions...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-gda-red">
        Failed to load definitions: {error.message}
      </div>
    );
  }

  if (!data || data.definitions.length === 0) {
    return (
      <div className="rounded border border-dashed border-border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No definitions available.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-[12px] text-muted-foreground">
        {data.definitions.length} terms
      </p>

      <div className="space-y-0">
        {data.definitions.map((def) => (
          <div
            key={def.term}
            className="border-b border-border/50 py-3"
          >
            <dt className="text-sm font-semibold text-foreground">
              {def.term}
            </dt>
            <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {def.definition}
            </dd>
          </div>
        ))}
      </div>

      <SourceFooter meta={data.meta} />
    </div>
  );
}
