import React from "react";
import SourceBadge from "../SourceBadge";

export interface SourceRef {
  kind:
    | "sam_gov"
    | "fpds"
    | "usaspending"
    | "govwin"
    | "news"
    | "doctrine"
    | "partner_site"
    | "internal";
  title: string;
  url: string;
  retrieved_at: string;
}

interface FieldWithSourceProps {
  label: string;
  value: string | null | undefined;
  sources?: SourceRef[];
}

const KIND_TO_SOURCE: Record<string, string> = {
  sam_gov: "sam.gov",
  fpds: "fpds",
  usaspending: "usaspending",
  govwin: "govwin",
  news: "manual",
  doctrine: "manual",
  partner_site: "manual",
  internal: "manual",
};

export default function FieldWithSource({
  label,
  value,
  sources,
}: FieldWithSourceProps) {
  return (
    <div className="field-with-source">
      <div className="field-with-source-label">{label}</div>
      <div className="field-with-source-value">{value || "\u2014"}</div>
      {sources && sources.length > 0 && (
        <div className="field-with-source-badges">
          {sources.length === 1 ? (
            <a
              href={sources[0].url}
              target="_blank"
              rel="noopener noreferrer"
              title={sources[0].title}
            >
              <SourceBadge
                source={KIND_TO_SOURCE[sources[0].kind] ?? "manual"}
                hideManual={false}
                size="sm"
              />
            </a>
          ) : (
            <SourceBadge
              source={`${sources.length} sources`}
              hideManual={false}
              size="sm"
              sources={sources}
            />
          )}
        </div>
      )}
    </div>
  );
}
