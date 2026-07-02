"use client";

import { useState } from "react";
import {
  useWhatNeedsMe,
  useApproveDraft,
  useRejectDraft,
  useEditDraft,
} from "@/hooks/use-action-items";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type {
  ActionItem,
  ActionItemDraftStatus,
} from "@/lib/types";
import Link from "next/link";

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: "bg-[#A12C7B]/15 text-[#A12C7B] border-[#A12C7B]/30",
  HIGH: "bg-orange-500/15 text-orange-600 border-orange-500/30",
  MEDIUM: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30",
  LOW: "bg-[#7A7974]/15 text-[#7A7974] border-[#7A7974]/30",
} as const;

const DRAFT_STATUS_LABELS: Record<ActionItemDraftStatus, string> = {
  pending: "Generating...",
  ready: "Draft Ready",
  approved: "Approved",
  sent: "Sent",
  rejected: "Rejected",
  no_context: "Needs human",
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
}

function isOverdue(item: ActionItem): boolean {
  if (!item.due_date || item.status === "done") return false;
  return new Date(item.due_date) < new Date();
}

export default function WhatNeedsMePanel() {
  const { data, isLoading } = useWhatNeedsMe(7);
  const items = data?.items ?? [];

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 bg-gda-panel" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <p className="text-caption text-muted-foreground py-2">
        No action items with drafts right now. All clear.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {items.map((item) => (
        <WhatNeedsMeRow key={item.id} item={item} />
      ))}
      {items.length >= 7 && (
        <Link
          href="/action-items"
          className="block text-center text-caption text-[#01696F] hover:underline py-1"
        >
          See all action items
        </Link>
      )}
    </div>
  );
}

function WhatNeedsMeRow({ item }: { item: ActionItem }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(item.draft_text ?? "");
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const approveMutation = useApproveDraft();
  const rejectMutation = useRejectDraft();
  const editMutation = useEditDraft();

  const overdue = isOverdue(item);
  const priority = item.priority ?? "MEDIUM";
  const draftStatus: ActionItemDraftStatus = item.draft_status ?? "pending";
  const isPending = draftStatus === "pending";
  const hasReadyDraft = draftStatus === "ready";

  return (
    <div className="rounded border border-[#D4D1CA]/50 bg-white">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-2 py-1.5 text-left hover:bg-[#F7F6F2] transition-colors"
      >
        <Badge
          variant="outline"
          className={cn("text-[11px] shrink-0 w-[56px] justify-center", PRIORITY_COLORS[priority])}
        >
          {priority}
        </Badge>
        <span className={cn(
          "flex-1 text-body text-[#28251D] truncate",
          overdue && "text-[#A12C7B]"
        )}>
          {item.title}
        </span>
        <span className={cn(
          "text-[11px] shrink-0",
          overdue ? "text-[#A12C7B]" : "text-[#7A7974]"
        )}>
          {item.due_date ? formatDate(item.due_date) : ""}
        </span>
        <span className={cn(
          "text-[11px] shrink-0 w-[80px] text-right",
          isPending ? "text-[#B45309]" : hasReadyDraft ? "text-[#01696F]" : "text-[#7A7974]"
        )}>
          {isPending && (
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 animate-spin rounded-full border-[1.5px] border-[#B45309] border-t-transparent" />
            </span>
          )}
          {DRAFT_STATUS_LABELS[draftStatus]}
        </span>
      </button>

      {expanded && (
        <div className="px-2 pb-2 space-y-2 border-t border-[#D4D1CA]/30">
          {/* Draft content */}
          {item.draft_text && !editing && (
            <pre className="text-caption whitespace-pre-wrap bg-[#F7F6F2] rounded p-2 mt-1 text-[#28251D]">
              {item.draft_text}
            </pre>
          )}

          {/* Edit mode */}
          {editing && (
            <div className="space-y-2 mt-1">
              <textarea
                className="w-full rounded border border-[#D4D1CA] bg-white p-2 text-caption text-[#28251D] min-h-[120px] resize-y focus:outline-none focus:border-[#01696F]"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
              />
              <div className="flex gap-1.5">
                <button
                  type="button"
                  disabled={editMutation.isPending || !editText.trim()}
                  onClick={() => {
                    editMutation.mutate(
                      { id: item.id, edited_text: editText },
                      { onSuccess: () => setEditing(false) },
                    );
                  }}
                  className="text-[11px] px-2 py-0.5 rounded bg-[#01696F] text-white hover:bg-[#01696F]/90 transition-colors disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setEditText(item.draft_text ?? "");
                  }}
                  className="text-[11px] px-2 py-0.5 rounded border border-[#D4D1CA] text-[#7A7974] hover:text-[#28251D] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Reject mode */}
          {rejectMode && (
            <div className="space-y-2 mt-1">
              <textarea
                className="w-full rounded border border-[#D4D1CA] bg-white p-2 text-caption text-[#28251D] min-h-[60px] resize-y focus:outline-none focus:border-[#A12C7B]"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Why reject this draft?"
              />
              <div className="flex gap-1.5">
                <button
                  type="button"
                  disabled={rejectMutation.isPending || !rejectReason.trim()}
                  onClick={() => {
                    rejectMutation.mutate(
                      { id: item.id, reason: rejectReason.trim() },
                      {
                        onSuccess: () => {
                          setRejectMode(false);
                          setRejectReason("");
                        },
                      },
                    );
                  }}
                  className="text-[11px] px-2 py-0.5 rounded bg-[#A12C7B] text-white hover:bg-[#A12C7B]/90 transition-colors disabled:opacity-50"
                >
                  Reject
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRejectMode(false);
                    setRejectReason("");
                  }}
                  className="text-[11px] px-2 py-0.5 rounded border border-[#D4D1CA] text-[#7A7974] hover:text-[#28251D] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Action buttons */}
          {hasReadyDraft && !editing && !rejectMode && (
            <div className="flex gap-1.5 mt-1">
              <button
                type="button"
                disabled={approveMutation.isPending}
                onClick={() => approveMutation.mutate({ id: item.id })}
                className="text-[11px] px-2 py-0.5 rounded bg-[#01696F] text-white hover:bg-[#01696F]/90 transition-colors disabled:opacity-50"
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() => setRejectMode(true)}
                className="text-[11px] px-2 py-0.5 rounded border border-[#A12C7B]/30 text-[#A12C7B] hover:bg-[#A12C7B]/10 transition-colors"
              >
                Reject
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditText(item.draft_text ?? "");
                  setEditing(true);
                }}
                className="text-[11px] px-2 py-0.5 rounded border border-[#D4D1CA] text-[#7A7974] hover:text-[#28251D] hover:border-[#01696F] transition-colors"
              >
                Edit
              </button>
            </div>
          )}

          {/* R1 evidence citations */}
          {item.draft_evidence_ids && item.draft_evidence_ids.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {item.draft_evidence_ids.map((ref, idx) => (
                <Link
                  key={idx}
                  href={ref.url}
                  className="text-[11px] px-1 py-0.5 rounded bg-[#01696F]/10 text-[#01696F] border border-[#01696F]/20 hover:bg-[#01696F]/20 transition-colors"
                >
                  {ref.title}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
