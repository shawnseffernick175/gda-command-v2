"use client";

import { useState } from "react";
import { useGenerateOutput } from "@/hooks/use-workshop";
import { cn } from "@/lib/utils";

const OUTPUT_OPTIONS = [
  {
    type: "executive_summary",
    label: "Executive summary",
    description: "1 page, branded",
    defaultFormat: "docx",
  },
  {
    type: "capture_brief",
    label: "Capture brief",
    description: "Capture skeleton + .docx",
    defaultFormat: "docx",
  },
  {
    type: "red_team_critique",
    label: "Red-team critique",
    description: "Section L/M review",
    defaultFormat: "docx",
  },
  {
    type: "gap_analysis",
    label: "Gap analysis vs RFP",
    description: "Requires separate RFP text",
    defaultFormat: "docx",
  },
  {
    type: "proposal_section",
    label: "Proposal section draft",
    description: "Pick topic + page count",
    defaultFormat: "docx",
  },
  {
    type: "compliance_matrix",
    label: "Compliance matrix",
    description: "L/M shall-statement matrix",
    defaultFormat: "xlsx",
  },
  {
    type: "email_summary",
    label: "Email summary",
    description: "Short, sendable summary",
    defaultFormat: "txt",
  },
  {
    type: "custom",
    label: "Custom",
    description: "Free-text prompt + format",
    defaultFormat: "docx",
  },
] as const;

const FORMATS = ["docx", "pptx", "xlsx", "txt"] as const;

export function GenerateDrawer({
  uploadId,
  onClose,
}: {
  uploadId: string;
  onClose: () => void;
}) {
  const [selectedType, setSelectedType] = useState<string>("");
  const [format, setFormat] = useState<string>("docx");
  const [customPrompt, setCustomPrompt] = useState("");
  const [proposalTopic, setProposalTopic] = useState("Technical Approach");
  const [proposalPages, setProposalPages] = useState(3);
  const [rfpText, setRfpText] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const generate = useGenerateOutput();

  const handleGenerate = () => {
    const config: Record<string, unknown> = {};
    if (selectedType === "custom") config.prompt = customPrompt;
    if (selectedType === "proposal_section") {
      config.topic = proposalTopic;
      config.page_count = proposalPages;
    }
    if (selectedType === "gap_analysis") {
      config.rfp_text = rfpText;
    }

    generate.mutate(
      {
        uploadId,
        output_type: selectedType,
        output_format: format,
        config,
      },
      {
        onSuccess: (data) => {
          setResult(data.rendered_text ?? "Output generated.");
        },
      },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-black/40">
      <div className="w-full max-w-lg rounded-t-lg sm:rounded-lg border border-border bg-card p-6 shadow-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-foreground">
            Generate output
          </h3>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground text-lg leading-none"
            onClick={onClose}
          >
            x
          </button>
        </div>

        {result ? (
          <div>
            <div className="rounded border border-border bg-gda-bg-base p-4 text-[13px] text-foreground whitespace-pre-wrap max-h-80 overflow-y-auto">
              {result}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-border px-4 py-1.5 text-[13px] font-medium text-foreground transition-colors hover:bg-gda-bg-base"
                onClick={() => {
                  navigator.clipboard.writeText(result);
                }}
              >
                Copy
              </button>
              <button
                type="button"
                className="rounded bg-gda-green px-4 py-1.5 text-[13px] font-medium text-gda-bg-deep transition-colors hover:bg-gda-green-muted"
                onClick={onClose}
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Output type selection */}
            <div className="space-y-1.5">
              {OUTPUT_OPTIONS.map((opt) => (
                <label
                  key={opt.type}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded border px-3 py-2 transition-colors",
                    selectedType === opt.type
                      ? "border-gda-green bg-gda-green/5"
                      : "border-border hover:bg-gda-panel",
                  )}
                >
                  <input
                    type="radio"
                    name="output_type"
                    value={opt.type}
                    checked={selectedType === opt.type}
                    onChange={(e) => {
                      setSelectedType(e.target.value);
                      setFormat(opt.defaultFormat);
                    }}
                    className="accent-gda-green"
                  />
                  <div>
                    <span className="text-[13px] font-medium text-foreground">
                      {opt.label}
                    </span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {opt.description}
                    </span>
                  </div>
                </label>
              ))}
            </div>

            {/* Config options for specific types */}
            {selectedType === "custom" && (
              <div className="mt-4">
                <label className="text-xs font-medium text-muted-foreground">
                  Custom prompt
                </label>
                <textarea
                  className="mt-1 w-full rounded border border-border bg-gda-bg-base p-2 text-[13px] text-foreground placeholder:text-muted-foreground"
                  rows={3}
                  placeholder="What would you like generated?"
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                />
              </div>
            )}

            {selectedType === "proposal_section" && (
              <div className="mt-4 space-y-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    Topic
                  </label>
                  <input
                    className="mt-1 w-full rounded border border-border bg-gda-bg-base p-2 text-[13px] text-foreground"
                    value={proposalTopic}
                    onChange={(e) => setProposalTopic(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    Page count
                  </label>
                  <input
                    type="number"
                    className="mt-1 w-20 rounded border border-border bg-gda-bg-base p-2 text-[13px] text-foreground tabular-nums"
                    value={proposalPages}
                    min={1}
                    max={20}
                    onChange={(e) =>
                      setProposalPages(Number(e.target.value) || 3)
                    }
                  />
                </div>
              </div>
            )}

            {selectedType === "gap_analysis" && (
              <div className="mt-4">
                <label className="text-xs font-medium text-muted-foreground">
                  Paste RFP text for gap analysis
                </label>
                <textarea
                  className="mt-1 w-full rounded border border-border bg-gda-bg-base p-2 text-[13px] text-foreground placeholder:text-muted-foreground"
                  rows={5}
                  placeholder="Paste the RFP/solicitation text here..."
                  value={rfpText}
                  onChange={(e) => setRfpText(e.target.value)}
                />
              </div>
            )}

            {/* Format selector */}
            {selectedType && (
              <div className="mt-4">
                <label className="text-xs font-medium text-muted-foreground">
                  Output format
                </label>
                <div className="mt-1 flex gap-2">
                  {FORMATS.map((f) => (
                    <button
                      key={f}
                      type="button"
                      className={cn(
                        "rounded border px-3 py-1 text-xs font-medium transition-colors",
                        format === f
                          ? "border-gda-green bg-gda-green/10 text-gda-green"
                          : "border-border text-muted-foreground hover:text-foreground",
                      )}
                      onClick={() => setFormat(f)}
                    >
                      .{f}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-border px-4 py-1.5 text-[13px] font-medium text-foreground transition-colors hover:bg-gda-bg-base"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded bg-gda-green px-4 py-1.5 text-[13px] font-medium text-gda-bg-deep transition-colors hover:bg-gda-green-muted disabled:opacity-50"
                onClick={handleGenerate}
                disabled={
                  !selectedType ||
                  generate.isPending ||
                  (selectedType === "custom" && !customPrompt.trim()) ||
                  (selectedType === "gap_analysis" && !rfpText.trim())
                }
              >
                {generate.isPending ? "Generating..." : "Generate"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
