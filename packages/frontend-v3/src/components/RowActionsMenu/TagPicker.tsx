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

interface TagPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentTags: string[];
  onSave: (tags: string[]) => void;
}

export function TagPicker({
  open,
  onOpenChange,
  currentTags,
  onSave,
}: TagPickerProps) {
  const [tags, setTags] = useState<string[]>(currentTags);
  const [input, setInput] = useState("");

  function handleOpen(isOpen: boolean) {
    if (isOpen) {
      setTags(currentTags);
      setInput("");
    }
    onOpenChange(isOpen);
  }

  function handleAddTag() {
    const tag = input.trim().toLowerCase();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
    }
    setInput("");
  }

  function handleRemoveTag(tag: string) {
    setTags(tags.filter((t) => t !== tag));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddTag();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage Tags</DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap gap-1.5 min-h-[28px]">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-mono border border-border rounded bg-gda-panel"
            >
              {tag}
              <button
                type="button"
                onClick={() => handleRemoveTag(tag)}
                className="text-muted-foreground hover:text-foreground ml-0.5"
                aria-label={`Remove tag ${tag}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2 mt-2">
          <input
            type="text"
            placeholder="Add tag…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 px-3 py-2 text-sm border border-border rounded bg-transparent focus:outline-none focus:ring-1 focus:ring-gda-cyan"
            autoFocus
          />
          <Button variant="outline" size="sm" onClick={handleAddTag}>
            Add
          </Button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => onSave(tags)}>Save Tags</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
