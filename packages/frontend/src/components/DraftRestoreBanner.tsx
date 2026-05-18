import { useState } from "react";
import { useDraftRestore } from "../hooks/useAutosave";

interface DraftRestoreBannerProps<T> {
  storageKey: string;
  onRestore: (draft: T) => void;
}

export default function DraftRestoreBanner<T>({ storageKey, onRestore }: DraftRestoreBannerProps<T>) {
  const { draft, draftAt, clearDraft } = useDraftRestore<T>(storageKey);
  const [dismissed, setDismissed] = useState(false);

  if (!draft || dismissed) return null;

  const timeStr = draftAt ? new Date(draftAt).toLocaleTimeString() : "recently";

  return (
    <div
      style={{
        background: "#1e3a5f",
        border: "1px solid #3b82f6",
        borderRadius: 6,
        padding: "10px 16px",
        marginBottom: 12,
        display: "flex",
        alignItems: "center",
        gap: 12,
        fontSize: 13,
        color: "#e2e8f0",
      }}
    >
      <span style={{ flex: 1 }}>
        Restore your unsaved changes from {timeStr}?
      </span>
      <button
        onClick={() => {
          onRestore(draft);
          clearDraft();
          setDismissed(true);
        }}
        style={{
          background: "#3b82f6",
          color: "#fff",
          border: "none",
          borderRadius: 4,
          padding: "4px 12px",
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        Restore
      </button>
      <button
        onClick={() => {
          clearDraft();
          setDismissed(true);
        }}
        style={{
          background: "transparent",
          color: "#94a3b8",
          border: "1px solid #475569",
          borderRadius: 4,
          padding: "4px 12px",
          cursor: "pointer",
          fontSize: 12,
        }}
      >
        Discard
      </button>
    </div>
  );
}
