"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUsers } from "@/hooks/use-action-items";

interface UserPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (userId: number, displayName: string) => void;
}

export function UserPicker({ open, onOpenChange, onSelect }: UserPickerProps) {
  const { data: users, isLoading } = useUsers();
  const [filter, setFilter] = useState("");

  const filtered = (users ?? []).filter(
    (u) =>
      u.display_name.toLowerCase().includes(filter.toLowerCase()) ||
      u.email.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Owner</DialogTitle>
        </DialogHeader>
        <input
          type="text"
          placeholder="Search users…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-border rounded bg-transparent focus:outline-none focus:ring-1 focus:ring-gda-cyan"
          autoFocus
        />
        <div className="max-h-48 overflow-y-auto space-y-1 mt-2">
          {isLoading && (
            <p className="text-xs text-muted-foreground px-2 py-1">
              Loading…
            </p>
          )}
          {!isLoading && filtered.length === 0 && (
            <p className="text-xs text-muted-foreground px-2 py-1">
              No users found
            </p>
          )}
          {filtered.map((user) => (
            <button
              key={user.id}
              type="button"
              className="w-full text-left px-3 py-1.5 text-sm rounded hover:bg-gda-panel transition-colors"
              onClick={() => onSelect(user.id, user.display_name)}
            >
              <span className="font-medium">{user.display_name}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {user.email}
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
