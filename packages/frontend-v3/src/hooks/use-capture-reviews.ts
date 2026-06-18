"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch, apiDownload } from "@/lib/api";
import type {
  CapturePlan,
  CaptureMilestone,
  ColorReview,
  ReviewDetail,
  MyOpenReview,
} from "@/lib/types";

// ── Capture Plan ────────────────────────────────────────────────

export function useCapturePlan(captureId: number | string | undefined) {
  return useQuery({
    queryKey: ["capture-plan", captureId],
    queryFn: () => apiGet<CapturePlan>(`/v3/captures/${captureId}/plan`),
    enabled: !!captureId,
  });
}

export function useSaveCapturePlan(captureId: number | string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<CapturePlan>) =>
      apiPost<CapturePlan>(`/v3/captures/${captureId}/plan`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["capture-plan", captureId] });
      void qc.invalidateQueries({ queryKey: ["pipeline"] });
    },
  });
}

// ── Milestones ──────────────────────────────────────────────────

export function useCaptureMilestones(captureId: number | string | undefined) {
  return useQuery({
    queryKey: ["capture-milestones", captureId],
    queryFn: () => apiGet<{ items: CaptureMilestone[] }>(`/v3/captures/${captureId}/milestones`),
    enabled: !!captureId,
  });
}

export function useAddMilestone(captureId: number | string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { milestone_name: string; due_date: string; status?: string; owner_contact?: string; notes?: string }) =>
      apiPost<CaptureMilestone>(`/v3/captures/${captureId}/milestones`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["capture-milestones", captureId] });
    },
  });
}

export function useUpdateMilestone(captureId: number | string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { id: number } & Partial<CaptureMilestone>) =>
      apiPatch<CaptureMilestone>(`/v3/captures/${captureId}/milestones/${data.id}`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["capture-milestones", captureId] });
    },
  });
}

// ── Color Reviews ───────────────────────────────────────────────

export function useCaptureReviews(captureId: number | string | undefined) {
  return useQuery({
    queryKey: ["capture-reviews", captureId],
    queryFn: () => apiGet<{ items: ColorReview[] }>(`/v3/captures/${captureId}/reviews`),
    enabled: !!captureId,
  });
}

export function useScheduleReview(captureId: number | string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      color: string;
      proposal_vault_doc_id?: number;
      rfp_vault_doc_id?: number;
      scheduled_date?: string;
      rubric?: string;
      reviewers?: Array<{ name: string; email?: string; role?: string }>;
      /**
       * When true, in addition to seeding this color's sections the review also
       * seeds a labeled back-review block for every prior color in doctrine
       * order (black → blue → pink → green → red → white). Lets a team start a
       * review at any color while still confirming earlier gates were met.
       */
      cumulative?: boolean;
    }) => apiPost<ColorReview>(`/v3/captures/${captureId}/reviews`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["capture-reviews", captureId] });
    },
  });
}

export function useReviewDetail(reviewId: number | string | undefined) {
  return useQuery({
    queryKey: ["review-detail", reviewId],
    queryFn: () => apiGet<ReviewDetail>(`/v3/reviews/${reviewId}`),
    enabled: !!reviewId,
  });
}

export function useSaveScore(reviewId: number | string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      section_id: number;
      reviewer_id: number;
      score?: number;
      color_rating?: string;
      strengths?: string;
      weaknesses?: string;
      recommendations?: string;
    }) => apiPatch(`/v3/reviews/${reviewId}/sections/${data.section_id}/score`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["review-detail", reviewId] });
    },
  });
}

export function useCompleteReview(reviewId: number | string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost(`/v3/reviews/${reviewId}/complete`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["review-detail", reviewId] });
      void qc.invalidateQueries({ queryKey: ["capture-reviews"] });
      void qc.invalidateQueries({ queryKey: ["pipeline"] });
      void qc.invalidateQueries({ queryKey: ["my-open-reviews"] });
    },
  });
}

export function useMyOpenReviews() {
  return useQuery({
    queryKey: ["my-open-reviews"],
    queryFn: () => apiGet<{ items: MyOpenReview[] }>("/v3/reviews/mine"),
  });
}

export function useAiSuggestScore(reviewId: number | string | undefined) {
  return useMutation({
    mutationFn: (data: { section_id: number }) =>
      apiPost<{
        suggested_score: number;
        suggested_color_rating: string;
        strengths: string;
        weaknesses: string;
        recommendations: string;
      }>(`/v3/reviews/${reviewId}/ai-suggest`, data),
  });
}

/**
 * Download a completed review's outbrief as a Word (.docx) or PDF document.
 * Streams raw file bytes from GET /v3/reviews/:id/outbrief and triggers a
 * browser "Save As". Returns a mutation so callers get isPending / isError.
 */
export function useDownloadOutbrief(reviewId: number | string | undefined) {
  return useMutation({
    mutationFn: (format: "docx" | "pdf") => {
      const ext = format === "pdf" ? "pdf" : "docx";
      return apiDownload(
        `/v3/reviews/${reviewId}/outbrief?format=${format}`,
        `outbrief-review-${reviewId}.${ext}`,
      );
    },
  });
}

export function useExtractRfp(reviewId: number | string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost(`/v3/reviews/${reviewId}/extract-rfp`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["review-detail", reviewId] });
    },
  });
}
