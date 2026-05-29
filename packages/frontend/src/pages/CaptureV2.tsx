import { useState, useEffect, useCallback, useRef } from "react";
import { authenticatedFetch } from "../api/auth";
import ComplianceMatrix from "../components/capture/ComplianceMatrix";
import ColorReviewStrip from "../components/capture/ColorReviewStrip";
import PricingGuardrail from "../components/capture/PricingGuardrail";
import TeamingWorksheetPanel from "../components/capture/TeamingWorksheetPanel";

interface CaptureItem {
  id: number;
  ou_tag: string;
  pipeline_item_id: number;
  rfp_uploaded_at: string | null;
  rfp_storage_url: string | null;
  compliance_matrix: unknown;
  color_review_stage: string;
  color_review_notes: string[];
  pricing_assumptions: PricingAssumptions;
  teaming_worksheet: unknown;
  created_at: string;
  updated_at: string;
  pipeline_capture_owner: string;
  opportunity_title: string;
  opportunity_agency: string | null;
}

interface PricingAssumptions {
  labor_rate?: number;
  overhead_pct?: number;
  fringe_pct?: number;
  fee_pct?: number;
  margin_pct?: number;
  notes?: string;
}

interface ComplianceItemRow {
  id: number;
  capture_id: number;
  section_number: string | null;
  requirement_text: string;
  owner_team: string | null;
  status: string;
  evidence_link: string | null;
}

const STAGE_LABELS: Record<string, string> = {
  pink: "Pink",
  red: "Red",
  gold: "Gold",
  submitted: "Submitted",
};

function formatDateEST(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function CaptureV2() {
  const [captures, setCaptures] = useState<CaptureItem[]>([]);
  const [selected, setSelected] = useState<CaptureItem | null>(null);
  const [complianceItems, setComplianceItems] = useState<ComplianceItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchCaptures = useCallback(async () => {
    try {
      const res = await authenticatedFetch("/api/captures");
      const json = await res.json();
      if (json.success && json.data?.items) {
        setCaptures(json.data.items);
        if (json.data.items.length > 0 && !selected) {
          setSelected(json.data.items[0]);
        }
      }
    } catch (err) {
      setError(String((err as Error).message));
    } finally {
      setLoading(false);
    }
  }, [selected]);

  useEffect(() => {
    fetchCaptures();
  }, [fetchCaptures]);

  const handleFileUpload = async (file: File) => {
    if (!selected) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await authenticatedFetch(
        `/api/captures/${selected.id}/shred-rfp`,
        {
          method: "POST",
          body: formData,
          headers: {},
        },
      );
      const json = await res.json();
      if (json.success && json.data?.compliance_items) {
        setComplianceItems(json.data.compliance_items);
        await fetchCaptures();
      }
    } catch (err) {
      setError(String((err as Error).message));
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleSelectCapture = (c: CaptureItem) => {
    setSelected(c);
    setComplianceItems([]);
  };

  const handleStageAdvanced = async () => {
    await fetchCaptures();
    if (selected) {
      const res = await authenticatedFetch("/api/captures");
      const json = await res.json();
      if (json.success && json.data?.items) {
        const updated = json.data.items.find(
          (c: CaptureItem) => c.id === selected.id,
        );
        if (updated) setSelected(updated);
      }
    }
  };

  if (loading) {
    return (
      <div className="container-page py-8">
        <p className="text-muted text-body">Loading captures...</p>
      </div>
    );
  }

  return (
    <div className="container-page py-8">
      <h1 className="text-display text-ink mb-2">Capture</h1>
      <p className="text-body text-muted mb-8">
        RFP &rarr; Compliance &rarr; Color Review &rarr; Submission
      </p>
      <p className="text-caption text-muted italic mb-8">
        Doctrine: Process over Personality &middot; Teamwork
      </p>

      {error && (
        <div className="card border-l-4 border-l-critical mb-4 p-4">
          <p className="text-body text-ink">{error}</p>
          <button
            className="text-caption text-accent mt-2"
            onClick={() => setError(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex gap-8">
        {/* Capture list */}
        <div className="w-72 flex-shrink-0">
          <h2 className="text-section text-ink mb-4">Captures</h2>
          {captures.length === 0 && (
            <p className="text-caption text-muted">No captures yet.</p>
          )}
          {captures.map((c) => (
            <button
              key={c.id}
              className={`w-full text-left p-4 mb-2 rounded border transition-colors duration-[120ms] ${
                selected?.id === c.id
                  ? "border-accent bg-white"
                  : "border-border bg-white hover:bg-bg"
              }`}
              onClick={() => handleSelectCapture(c)}
            >
              <p className="text-body text-ink font-medium truncate">
                {c.opportunity_title}
              </p>
              <p className="text-caption text-muted">
                {c.opportunity_agency || "—"} &middot;{" "}
                {STAGE_LABELS[c.color_review_stage] || c.color_review_stage}
              </p>
              <p className="text-caption text-muted">
                {formatDateEST(c.updated_at)}
              </p>
            </button>
          ))}
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {!selected ? (
            <div className="card p-8 text-center">
              <p className="text-body text-muted">
                Select a capture or create one from the Pipeline.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* RFP upload zone */}
              <div className="card">
                <h3 className="text-section text-ink mb-4">RFP Upload</h3>
                {selected.rfp_uploaded_at ? (
                  <p className="text-body text-muted">
                    RFP uploaded {formatDateEST(selected.rfp_uploaded_at)}
                  </p>
                ) : (
                  <div
                    className="border-2 border-dashed border-border rounded p-8 text-center cursor-pointer hover:bg-bg transition-colors duration-[120ms]"
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.docx"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleFileUpload(f);
                      }}
                    />
                    {uploading ? (
                      <p className="text-body text-muted">Processing RFP...</p>
                    ) : (
                      <p className="text-body text-muted">
                        Drop RFP here (PDF or DOCX) or click to browse.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Compliance matrix */}
              <ComplianceMatrix
                captureId={selected.id}
                items={complianceItems}
                onItemsChange={setComplianceItems}
              />

              {/* Color review stage */}
              <ColorReviewStrip
                captureId={selected.id}
                currentStage={selected.color_review_stage}
                onStageAdvanced={handleStageAdvanced}
              />

              {/* Pricing guardrail */}
              <PricingGuardrail
                captureId={selected.id}
                initialAssumptions={selected.pricing_assumptions}
              />

              {/* Teaming worksheet */}
              <TeamingWorksheetPanel captureId={selected.id} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
