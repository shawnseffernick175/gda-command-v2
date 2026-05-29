import { useState } from "react";

interface Props {
  onClose: () => void;
  onSubmit: (emailText: string) => void;
}

export default function EmailPasteModal({ onClose, onSubmit }: Props) {
  const [text, setText] = useState("");

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="card w-[560px] p-6">
        <h3 className="text-section text-ink mb-4">Paste Email Text</h3>
        <p className="text-body text-muted mb-4">
          Paste the email body below. The system will extract the action item,
          owner, due date, and draft a response.
        </p>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full h-40 px-3 py-2 text-body border border-border rounded bg-white text-ink resize-none mb-4"
          placeholder="Paste email content here..."
        />

        <div className="flex gap-2 justify-end">
          <button
            className="h-8 px-4 rounded text-[13px] font-medium border border-border bg-white text-ink hover:bg-bg transition-colors duration-[120ms]"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="h-8 px-4 rounded text-[13px] font-medium bg-accent text-white border border-accent hover:bg-[#015C61] transition-colors duration-[120ms]"
            onClick={() => onSubmit(text)}
            disabled={!text.trim()}
          >
            Extract Action Item
          </button>
        </div>
      </div>
    </div>
  );
}
