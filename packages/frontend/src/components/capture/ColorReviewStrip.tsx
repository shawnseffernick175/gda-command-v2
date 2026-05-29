import { useState } from "react";
import { authenticatedFetch } from "../../api/auth";

interface Props {
  captureId: number;
  currentStage: string;
  onStageAdvanced: () => void;
}

const STAGES = ["pink", "red", "gold", "submitted"];
const STAGE_LABELS: Record<string, string> = {
  pink: "Pink",
  red: "Red",
  gold: "Gold",
  submitted: "Submitted",
};

export default function ColorReviewStrip({
  captureId,
  currentStage,
  onStageAdvanced,
}: Props) {
  const [showModal, setShowModal] = useState(false);
  const [note, setNote] = useState("");
  const [advancing, setAdvancing] = useState(false);

  const currentIdx = STAGES.indexOf(currentStage);
  const isFinal = currentIdx === STAGES.length - 1;

  const handleAdvance = async () => {
    setAdvancing(true);
    try {
      const res = await authenticatedFetch(
        `/api/captures/${captureId}/advance-stage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-gda-key": "header" },
          body: JSON.stringify({ note }),
        },
      );
      const json = await res.json();
      if (json.success) {
        setShowModal(false);
        setNote("");
        onStageAdvanced();
      }
    } catch {
      // non-fatal
    } finally {
      setAdvancing(false);
    }
  };

  return (
    <div className="card">
      <h3 className="text-section text-ink mb-4">Color Review Stage</h3>

      <div className="flex items-center gap-4 mb-4">
        {STAGES.map((stage, idx) => {
          const isPast = idx < currentIdx;
          const isCurrent = idx === currentIdx;

          return (
            <div key={stage} className="flex items-center gap-2">
              <div
                className={`flex items-center justify-center w-8 h-8 rounded text-caption font-semibold ${
                  isCurrent
                    ? "bg-accent text-white"
                    : isPast
                      ? "bg-accent text-white opacity-60"
                      : "bg-bg text-muted border border-border"
                }`}
              >
                {isPast ? "\u2713" : idx + 1}
              </div>
              <span
                className={`text-body ${
                  isCurrent
                    ? "text-ink font-semibold"
                    : isPast
                      ? "text-accent"
                      : "text-muted"
                }`}
              >
                {STAGE_LABELS[stage]}
              </span>
              {idx < STAGES.length - 1 && (
                <div className="w-8 h-px bg-border" />
              )}
            </div>
          );
        })}
      </div>

      {!isFinal && (
        <button
          className="h-8 px-4 rounded text-[13px] font-medium bg-accent text-white border border-accent hover:bg-[#015C61] transition-colors duration-[120ms]"
          onClick={() => setShowModal(true)}
        >
          Advance Stage
        </button>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="card w-96 p-6">
            <h4 className="text-section text-ink mb-4">Reviewer Note</h4>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note for this stage transition..."
              className="w-full h-24 px-3 py-2 text-body border border-border rounded bg-white text-ink resize-none mb-4"
            />
            <div className="flex gap-2 justify-end">
              <button
                className="h-8 px-4 rounded text-[13px] font-medium border border-border bg-white text-ink hover:bg-bg transition-colors duration-[120ms]"
                onClick={() => {
                  setShowModal(false);
                  setNote("");
                }}
              >
                Cancel
              </button>
              <button
                className="h-8 px-4 rounded text-[13px] font-medium bg-accent text-white border border-accent hover:bg-[#015C61] transition-colors duration-[120ms]"
                onClick={handleAdvance}
                disabled={advancing}
              >
                {advancing ? "Advancing..." : "Advance"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
