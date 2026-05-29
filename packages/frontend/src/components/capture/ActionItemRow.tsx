import SourceBadge from "../SourceBadge";
import type { SourceRef } from "../opportunity/FieldWithSource";

interface Draft {
  id: number;
  action_item_id: number;
  kind: string;
  draft_text: string;
  status: string;
  created_at: string;
}

interface ActionItem {
  id: number;
  ou_tag: string;
  title: string;
  title_sources?: SourceRef[];
  detail: string | null;
  detail_sources?: SourceRef[];
  owner_email: string;
  owner_email_sources?: SourceRef[];
  source: string;
  source_id: string | null;
  due_date: string | null;
  due_date_sources?: SourceRef[];
  due_inferred_from: string | null;
  status: string;
  created_at: string;
  completed_at: string | null;
  linked_record_type: string | null;
  linked_record_id: number | null;
  drafts: Draft[] | null;
}

interface Props {
  item: ActionItem;
  expanded: boolean;
  onToggle: () => void;
  onStatusChange: (itemId: number, status: string) => void;
  onApproveDraft: (itemId: number, draftId: number) => void;
}

const SOURCE_LABELS: Record<string, string> = {
  email: "Email",
  manual: "Manual",
  sentinel: "Sentinel",
  launchpad: "Launchpad",
};

const KIND_TO_SOURCE_MAP: Record<string, string> = {
  sam_gov: "sam.gov",
  fpds: "fpds",
  usaspending: "usaspending",
  govwin: "govwin",
  internal: "manual",
  news: "manual",
  doctrine: "manual",
  partner_site: "manual",
};

function InlineSources({ sources }: { sources: SourceRef[] }) {
  if (!sources || sources.length === 0) return null;
  if (sources.length === 1) {
    return (
      <a href={sources[0].url} target="_blank" rel="noopener noreferrer" title={sources[0].title}>
        <SourceBadge source={KIND_TO_SOURCE_MAP[sources[0].kind] ?? "manual"} hideManual={false} size="sm" />
      </a>
    );
  }
  return (
    <SourceBadge
      source={`${sources.length} sources`}
      hideManual={false}
      size="sm"
      sources={sources}
    />
  );
}

const KIND_LABELS: Record<string, string> = {
  reply: "Reply",
  research: "Research",
  milestone: "Milestone",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
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

function getDueDateClass(dueDate: string | null): string {
  if (!dueDate) return "text-muted";
  const now = new Date();
  const due = new Date(dueDate);
  const diffDays = (due.getTime() - now.getTime()) / 86400000;
  if (diffDays < 0) return "text-critical font-semibold";
  if (diffDays <= 3) return "text-[#B45309] font-medium";
  return "text-muted";
}

export default function ActionItemRow({
  item,
  expanded,
  onToggle,
  onStatusChange,
  onApproveDraft,
}: Props) {
  const drafts = item.drafts || [];

  return (
    <div className="card p-0">
      <button
        className="w-full text-left p-4 hover:bg-bg transition-colors duration-[120ms]"
        onClick={onToggle}
      >
        <div className="flex items-center gap-4">
          <span className="text-body text-ink font-medium flex-1 truncate inline-flex items-center gap-1">
            {item.title}
            {item.title_sources && <InlineSources sources={item.title_sources} />}
          </span>
          <span className="text-caption text-muted px-2 py-0.5 rounded border border-border bg-white">
            {item.owner_email}
          </span>
          <span className={`text-caption ${getDueDateClass(item.due_date)}`}>
            {item.due_date ? formatDateEST(item.due_date) : "No due date"}
          </span>
          <span className="text-caption text-muted px-2 py-0.5 rounded border border-border bg-white">
            {SOURCE_LABELS[item.source] || item.source}
          </span>
          {item.linked_record_type && (
            <span className="text-caption text-accent px-2 py-0.5 rounded border border-accent bg-white">
              {item.linked_record_type}
            </span>
          )}
          {item.status !== "done" && (
            <div className="flex gap-1">
              <button
                className="h-8 px-3 rounded text-[13px] font-medium border border-border bg-white text-ink hover:bg-bg transition-colors duration-[120ms]"
                onClick={(e) => {
                  e.stopPropagation();
                  onStatusChange(item.id, "done");
                }}
              >
                Mark Done
              </button>
              {item.status !== "blocked" && (
                <button
                  className="h-8 px-3 rounded text-[13px] font-medium border border-border bg-white text-ink hover:bg-bg transition-colors duration-[120ms]"
                  onClick={(e) => {
                    e.stopPropagation();
                    onStatusChange(item.id, "blocked");
                  }}
                >
                  Mark Blocked
                </button>
              )}
            </div>
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border p-4">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-caption text-muted uppercase tracking-wider mb-1">
                Owner
              </p>
              <p className="text-body text-ink">{item.owner_email}</p>
            </div>
            <div>
              <p className="text-caption text-muted uppercase tracking-wider mb-1">
                Due Date
              </p>
              <p className={`text-body ${getDueDateClass(item.due_date)}`}>
                {item.due_date ? formatDateEST(item.due_date) : "TBD"}
                {item.due_inferred_from && (
                  <span className="text-caption text-muted ml-2">
                    (inferred: &ldquo;{item.due_inferred_from}&rdquo;)
                  </span>
                )}
              </p>
            </div>
          </div>

          {item.detail && (
            <div className="mb-4">
              <p className="text-caption text-muted uppercase tracking-wider mb-1">
                Detail
              </p>
              <p className="text-body text-ink whitespace-pre-wrap">
                {item.detail}
              </p>
            </div>
          )}

          {drafts.length > 0 && (
            <div>
              <p className="text-caption text-muted uppercase tracking-wider mb-2">
                Drafts
              </p>
              {drafts.map((draft) => (
                <div
                  key={draft.id}
                  className="bg-bg rounded p-4 border border-border mb-2"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-caption text-accent font-semibold">
                      {KIND_LABELS[draft.kind] || draft.kind}
                    </span>
                    <span
                      className={`text-caption px-2 py-0.5 rounded border ${
                        draft.status === "approved"
                          ? "border-accent text-accent"
                          : draft.status === "rejected"
                            ? "border-critical text-critical"
                            : "border-border text-muted"
                      }`}
                    >
                      {STATUS_LABELS[draft.status] || draft.status}
                    </span>
                  </div>
                  <p className="text-body text-ink whitespace-pre-wrap mb-2">
                    {draft.draft_text}
                  </p>
                  {draft.status === "pending" && (
                    <button
                      className="h-8 px-4 rounded text-[13px] font-medium bg-accent text-white border border-accent hover:bg-[#015C61] transition-colors duration-[120ms]"
                      onClick={() => onApproveDraft(item.id, draft.id)}
                    >
                      Approve
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
