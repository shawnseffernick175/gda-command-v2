import { useState, useEffect, useRef, type ReactNode } from "react";

export interface Command {
  id: string;
  label: string;
  shortcut?: string;
  icon?: ReactNode;
  action: () => void;
}

export interface CommandGroup {
  label: string;
  commands: Command[];
}

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  commands: CommandGroup[];
  onExecute: (command: Command) => void;
}

export function CommandPalette({ open, onClose, commands, onExecute }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = commands
    .map((g) => ({
      ...g,
      commands: g.commands.filter((c) =>
        c.label.toLowerCase().includes(query.toLowerCase())
      ),
    }))
    .filter((g) => g.commands.length > 0);

  const flatItems = filtered.flatMap((g) => g.commands);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, flatItems.length - 1)); }
      if (e.key === "ArrowUp") { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
      if (e.key === "Enter") {
        e.preventDefault();
        const item = flatItems[activeIndex];
        if (item) { onExecute(item); item.action(); onClose(); }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, activeIndex, flatItems, onClose, onExecute]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24">
      <div className="fixed inset-0 bg-canvas/60" onClick={onClose} />
      <div className="relative w-[560px] max-h-[400px] rounded-md border border-border bg-surface-raised overflow-hidden">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
          placeholder="Search commands..."
          className="w-full h-10 px-4 text-md bg-transparent text-ink-primary placeholder:text-ink-dim outline-none border-b border-border"
          role="combobox"
          aria-expanded="true"
          aria-activedescendant={flatItems[activeIndex]?.id}
        />
        <div className="overflow-y-auto max-h-[340px] p-1" role="listbox">
          {filtered.map((group) => (
            <div key={group.label}>
              <div className="px-3 py-1 text-xs text-ink-muted uppercase tracking-wider">
                {group.label}
              </div>
              {group.commands.map((cmd) => {
                const idx = flatItems.indexOf(cmd);
                return (
                  <div
                    key={cmd.id}
                    id={cmd.id}
                    role="option"
                    aria-selected={idx === activeIndex}
                    className={[
                      "flex items-center h-10 px-3 rounded-sm text-sm text-ink-primary cursor-pointer",
                      idx === activeIndex ? "bg-surface" : "",
                    ].join(" ")}
                    onClick={() => { onExecute(cmd); cmd.action(); onClose(); }}
                    onMouseEnter={() => setActiveIndex(idx)}
                  >
                    {cmd.icon && <span className="mr-2 text-ink-muted">{cmd.icon}</span>}
                    <span className="flex-1">{cmd.label}</span>
                    {cmd.shortcut && (
                      <span className="text-xs text-ink-dim font-mono">{cmd.shortcut}</span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          {flatItems.length === 0 && (
            <div className="px-3 py-4 text-sm text-ink-muted text-center">
              No commands found
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
