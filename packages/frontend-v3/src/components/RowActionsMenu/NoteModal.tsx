"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface NoteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (body: string) => void;
  isPending: boolean;
}

export function NoteModal({
  open,
  onOpenChange,
  onSave,
  isPending,
}: NoteModalProps) {
  const [body, setBody] = useState("");

  function handleOpen(isOpen: boolean) {
    if (isOpen) {
      setBody("");
    }
    onOpenChange(isOpen);
  }

  function handleSubmit() {
    if (body.trim()) {
      onSave(body.trim());
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Note</DialogTitle>
        </DialogHeader>
        <textarea
          placeholder="Write a note…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={4}
          className="w-full px-3 py-2 text-sm border border-border rounded bg-transparent resize-none focus:outline-none focus:ring-1 focus:ring-gda-cyan"
          autoFocus
        />
        <p className="text-xs text-muted-foreground">
          Ctrl+Enter to save
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending || !body.trim()}
          >
            {isPending ? "Saving…" : "Save Note"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
