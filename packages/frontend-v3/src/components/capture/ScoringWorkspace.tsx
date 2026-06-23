"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import {
  useReviewDetail,
  useSaveScore,
  useCompleteReview,
  useAiSuggestScore,
} from "@/hooks/use-capture-reviews";
import type { ColorReviewScore, ReviewColor } from "@/lib/types";

const COLOR_LABELS: Record<ReviewColor, string> = {
  pink: "Pink Team",
  red: "Red Team",
  black: "Black Hat",
  blue: "Blue Team",
  white: "White Team",
  green: "Green (Pricing)",
};

interface ScoringWorkspaceProps {
  reviewId: number;
  onClose: () => void;
}

export function ScoringWorkspace({ reviewId, onClose }: ScoringWorkspaceProps) {
  const { data: review, isLoading } = useReviewDetail(reviewId);
  const saveScore = useSaveScore(reviewId);
  const completeReview = useCompleteReview(reviewId);
  const aiSuggest = useAiSuggestScore(reviewId);

  const [currentSectionIdx, setCurrentSectionIdx] = useState(0);
  const sections = review?.sections ?? [];
  const scores = useMemo(() => review?.scores ?? [], [review?.scores]);
  const reviewers = review?.reviewers ?? [];
  const currentSection = sections[currentSectionIdx];
  const currentReviewer = reviewers[0];

  // Derive initial values for current section
  const existingScore = useMemo(() => {
    if (!currentSection || !currentReviewer) return null;
    return scores.find(
      (s: ColorReviewScore) => s.section_id === currentSection.id && s.reviewer_id === currentReviewer.id
    ) ?? null;
  }, [currentSection, currentReviewer, scores]);

  const [score, setScore] = useState<number | "">("");
  const [colorRating, setColorRating] = useState("");
  const [strengths, setStrengths] = useState("");
  const [weaknesses, setWeaknesses] = useState("");
  const [recommendations, setRecommendations] = useState("");

  // Sync form state when section changes (using a key pattern)
  const sectionKey = `${currentSection?.id}-${currentReviewer?.id}`;
  const [lastSyncedKey, setLastSyncedKey] = useState("");
  if (sectionKey !== lastSyncedKey) {
    setLastSyncedKey(sectionKey);
    setScore(existingScore?.score ?? "");
    setColorRating(existingScore?.color_rating ?? "");
    setStrengths(existingScore?.strengths ?? "");
    setWeaknesses(existingScore?.weaknesses ?? "");
    setRecommendations(existingScore?.recommendations ?? "");
  }

  const handleSave = useCallback(() => {
    if (!currentSection || !currentReviewer) return;
    saveScore.mutate({
      section_id: currentSection.id,
      reviewer_id: currentReviewer.id,
      score: score === "" ? undefined : Number(score),
      color_rating: colorRating || undefined,
      strengths: strengths || undefined,
      weaknesses: weaknesses || undefined,
      recommendations: recommendations || undefined,
    });
  }, [currentSection, currentReviewer, score, colorRating, strengths, weaknesses, recommendations, saveScore]);

  const handleAiSuggest = useCallback(() => {
    if (!currentSection) return;
    aiSuggest.mutate({ section_id: currentSection.id }, {
      onSuccess: (data) => {
        if (data) {
          setScore(data.suggested_score);
          setColorRating(data.suggested_color_rating);
          setStrengths(data.strengths);
          setWeaknesses(data.weaknesses);
          setRecommendations(data.recommendations);
        }
      },
    });
  }, [currentSection, aiSuggest]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      switch (e.key) {
        case "j":
          if (currentSectionIdx < sections.length - 1) setCurrentSectionIdx((i) => i + 1);
          break;
        case "k":
          if (currentSectionIdx > 0) setCurrentSectionIdx((i) => i - 1);
          break;
        case "s":
          e.preventDefault();
          handleSave();
          break;
        case "1": case "2": case "3": case "4": case "5":
          setScore(Number(e.key));
          break;
        default:
          break;
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentSectionIdx, sections.length, handleSave]);

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-gda-bg-deep">
        <div className="animate-pulse text-sm text-muted-foreground">Loading review…</div>
      </div>
    );
  }

  if (!review || sections.length === 0) {
    return (
      <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-gda-bg-deep">
        <p className="text-sm text-muted-foreground">No sections to score. Run RFP extraction first.</p>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 rounded border border-border px-3 py-1.5 text-xs text-foreground hover:bg-gda-panel"
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-gda-bg-deep">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-foreground uppercase">
            {COLOR_LABELS[review.color]} Review
          </span>
          <span className="text-[11px] text-muted-foreground">
            Section {currentSectionIdx + 1} of {sections.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">
            j/k nav · 1-5 score · s save
          </span>
          <button
            type="button"
            onClick={() => { handleSave(); onClose(); }}
            className="rounded border border-border px-3 py-1 text-xs text-foreground hover:bg-gda-panel"
          >
            Save & Exit
          </button>
        </div>
      </div>

      {/* Three-pane layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: RFP criterion */}
        <div className="w-1/3 overflow-y-auto border-r border-border p-4 space-y-4">
          <h4 className="text-[11px] font-medium text-muted-foreground uppercase">RFP Criterion</h4>
          <div className="space-y-2">
            <p className="text-xs font-medium text-foreground">
              {currentSection.section_m_criterion ?? currentSection.section_name}
            </p>
            {currentSection.section_l_requirement && (
              <div className="rounded border border-border bg-gda-panel p-2">
                <span className="text-[11px] text-muted-foreground">Section L:</span>
                <p className="mt-1 text-xs text-foreground">{currentSection.section_l_requirement}</p>
              </div>
            )}
            {currentSection.rfp_text_excerpt && (
              <div className="rounded border border-border bg-gda-panel p-2">
                <span className="text-[11px] text-muted-foreground">RFP Text:</span>
                <p className="mt-1 text-xs text-foreground whitespace-pre-wrap">{currentSection.rfp_text_excerpt}</p>
              </div>
            )}
            {currentSection.weight_pct != null && (
              <p className="text-[11px] text-muted-foreground">
                Weight: {currentSection.weight_pct}%
              </p>
            )}
          </div>
        </div>

        {/* Center: proposal text */}
        <div className="w-1/3 overflow-y-auto border-r border-border p-4 space-y-4">
          <h4 className="text-[11px] font-medium text-muted-foreground uppercase">Proposal Section</h4>
          {currentSection.proposal_text_excerpt ? (
            <p className="text-xs text-foreground whitespace-pre-wrap">
              {currentSection.proposal_text_excerpt}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              No proposal text mapped to this section yet.
            </p>
          )}
        </div>

        {/* Right: score form */}
        <div className="w-1/3 overflow-y-auto p-4 space-y-4">
          <h4 className="text-[11px] font-medium text-muted-foreground uppercase">Your Score & Notes</h4>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-[11px] text-muted-foreground">Color Rating</span>
              <select
                value={colorRating}
                onChange={(e) => setColorRating(e.target.value)}
                className="mt-0.5 w-full rounded border border-border bg-gda-panel px-2 py-1 text-xs text-foreground"
              >
                <option value="">—</option>
                <option value="Blue">Blue (Exceeds)</option>
                <option value="Green">Green (Meets)</option>
                <option value="Yellow">Yellow (Weakness)</option>
                <option value="Red">Red (Sig. Weakness)</option>
                <option value="Pink">Pink (Deficient)</option>
              </select>
            </div>
            <div>
              <span className="text-[11px] text-muted-foreground">Score (1-5)</span>
              <input
                type="number"
                min={1}
                max={5}
                value={score}
                onChange={(e) => setScore(e.target.value === "" ? "" : Number(e.target.value))}
                className="mt-0.5 w-full rounded border border-border bg-gda-panel px-2 py-1 text-xs text-foreground"
              />
            </div>
          </div>

          <div>
            <span className="text-[11px] text-muted-foreground">Strengths</span>
            <textarea
              value={strengths}
              onChange={(e) => setStrengths(e.target.value)}
              rows={3}
              className="mt-0.5 w-full rounded border border-border bg-gda-panel px-2 py-1 text-xs text-foreground resize-none"
            />
          </div>

          <div>
            <span className="text-[11px] text-muted-foreground">Weaknesses</span>
            <textarea
              value={weaknesses}
              onChange={(e) => setWeaknesses(e.target.value)}
              rows={3}
              className="mt-0.5 w-full rounded border border-border bg-gda-panel px-2 py-1 text-xs text-foreground resize-none"
            />
          </div>

          <div>
            <span className="text-[11px] text-muted-foreground">Recommendations</span>
            <textarea
              value={recommendations}
              onChange={(e) => setRecommendations(e.target.value)}
              rows={3}
              className="mt-0.5 w-full rounded border border-border bg-gda-panel px-2 py-1 text-xs text-foreground resize-none"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saveScore.isPending}
              className="rounded border border-gda-green/30 bg-gda-green/10 px-3 py-1.5 text-xs font-medium text-gda-green hover:bg-gda-green/20 disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={handleAiSuggest}
              disabled={aiSuggest.isPending}
              className="rounded border border-gda-cyan/30 bg-gda-cyan/10 px-3 py-1.5 text-xs font-medium text-gda-cyan hover:bg-gda-cyan/20 disabled:opacity-50"
            >
              {aiSuggest.isPending ? "Thinking…" : "AI Suggest Score"}
            </button>
          </div>
        </div>
      </div>

      {/* Bottom nav */}
      <div className="flex items-center justify-between border-t border-border px-4 py-2">
        <button
          type="button"
          disabled={currentSectionIdx === 0}
          onClick={() => { handleSave(); setCurrentSectionIdx((i) => i - 1); }}
          className="rounded border border-border px-3 py-1 text-xs text-foreground hover:bg-gda-panel disabled:opacity-30"
        >
          ← Prev
        </button>
        <span className="text-xs text-muted-foreground">
          {currentSection.section_name}
        </span>
        {currentSectionIdx < sections.length - 1 ? (
          <button
            type="button"
            onClick={() => { handleSave(); setCurrentSectionIdx((i) => i + 1); }}
            className="rounded border border-border px-3 py-1 text-xs text-foreground hover:bg-gda-panel"
          >
            Next →
          </button>
        ) : (
          <button
            type="button"
            onClick={() => completeReview.mutate(undefined, { onSuccess: () => onClose() })}
            disabled={completeReview.isPending}
            className="rounded border border-gda-green/30 bg-gda-green/10 px-3 py-1.5 text-xs font-medium text-gda-green hover:bg-gda-green/20 disabled:opacity-50"
          >
            {completeReview.isPending ? "Completing…" : "Complete Review"}
          </button>
        )}
      </div>
    </div>
  );
}
