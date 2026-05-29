import { useState } from "react";

interface Props {
  onClose: () => void;
  onSubmit: (data: {
    title: string;
    detail: string;
    owner_email: string;
    due_date: string;
  }) => void;
}

export default function NewActionItemModal({ onClose, onSubmit }: Props) {
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("shawn");
  const [dueDate, setDueDate] = useState("");
  const [ownerError, setOwnerError] = useState<string | null>(null);

  const TEAM_NAMES = ["team", "all", "everyone", "committee", "group"];

  const handleSubmit = () => {
    if (!title.trim()) return;

    if (!ownerEmail.trim()) {
      setOwnerError(
        "Individual owner required (Doctrine: Relentless Execution).",
      );
      return;
    }

    if (TEAM_NAMES.includes(ownerEmail.trim().toLowerCase())) {
      setOwnerError(
        "Individual owner required (Doctrine: Relentless Execution).",
      );
      return;
    }

    setOwnerError(null);
    onSubmit({
      title: title.trim(),
      detail,
      owner_email: ownerEmail.trim(),
      due_date: dueDate,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="card w-[480px] p-6">
        <h3 className="text-section text-ink mb-4">New Action Item</h3>

        <div className="mb-4">
          <label className="text-caption text-muted uppercase tracking-wider block mb-1">
            Title *
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 text-body border border-border rounded bg-white text-ink"
            placeholder="Action item title"
          />
        </div>

        <div className="mb-4">
          <label className="text-caption text-muted uppercase tracking-wider block mb-1">
            Detail
          </label>
          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            className="w-full h-20 px-3 py-2 text-body border border-border rounded bg-white text-ink resize-none"
            placeholder="Optional detail"
          />
        </div>

        <div className="mb-4">
          <label className="text-caption text-muted uppercase tracking-wider block mb-1">
            Owner *
          </label>
          <input
            type="text"
            value={ownerEmail}
            onChange={(e) => {
              setOwnerEmail(e.target.value);
              setOwnerError(null);
            }}
            className={`w-full px-3 py-2 text-body border rounded bg-white text-ink ${
              ownerError ? "border-critical" : "border-border"
            }`}
            placeholder="shawn"
          />
          {ownerError && (
            <p className="text-caption text-critical mt-1">{ownerError}</p>
          )}
        </div>

        <div className="mb-6">
          <label className="text-caption text-muted uppercase tracking-wider block mb-1">
            Due Date
          </label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full px-3 py-2 text-body border border-border rounded bg-white text-ink"
          />
        </div>

        <div className="flex gap-2 justify-end">
          <button
            className="h-8 px-4 rounded text-[13px] font-medium border border-border bg-white text-ink hover:bg-bg transition-colors duration-[120ms]"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="h-8 px-4 rounded text-[13px] font-medium bg-accent text-white border border-accent hover:bg-[#015C61] transition-colors duration-[120ms]"
            onClick={handleSubmit}
            disabled={!title.trim()}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
