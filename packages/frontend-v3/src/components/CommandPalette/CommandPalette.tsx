import { useState, useEffect } from 'react';
import type { CommandPaletteProps, Command } from '../../types';

export function CommandPalette({ open, onClose, commands, onExecute }: CommandPaletteProps) {
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!open) { setSearch(''); setActiveIndex(0); }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const flatCmds: { group: string; cmd: Command }[] = [];
  commands.forEach((g) =>
    g.commands
      .filter((c) => c.label.toLowerCase().includes(search.toLowerCase()))
      .forEach((cmd) => flatCmds.push({ group: g.label, cmd }))
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, flatCmds.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && flatCmds[activeIndex]) { onExecute(flatCmds[activeIndex].cmd); onClose(); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-canvas/60" onClick={onClose}>
      <div
        className="w-[560px] max-h-[400px] rounded-md border border-border bg-surface-raised overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="combobox"
        aria-expanded={true}
      >
        <input
          className="w-full px-4 py-3 bg-transparent text-md text-ink-primary placeholder:text-ink-dim outline-none border-b border-border"
          placeholder="Search commands…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setActiveIndex(0); }}
          onKeyDown={handleKeyDown}
          autoFocus
        />
        <div className="overflow-y-auto max-h-[340px]" role="listbox">
          {commands.map((group) => {
            const filtered = group.commands.filter((c) => c.label.toLowerCase().includes(search.toLowerCase()));
            if (filtered.length === 0) return null;
            return (
              <div key={group.label}>
                <div className="px-4 py-1.5 text-xs uppercase tracking-[0.04em] text-ink-muted font-semibold">
                  {group.label}
                </div>
                {filtered.map((cmd) => {
                  const idx = flatCmds.findIndex((f) => f.cmd.id === cmd.id);
                  return (
                    <div
                      key={cmd.id}
                      role="option"
                      aria-selected={idx === activeIndex}
                      className={`flex items-center justify-between px-4 h-10 text-sm cursor-pointer ${idx === activeIndex ? 'bg-surface' : ''} text-ink-primary hover:bg-surface`}
                      onClick={() => { onExecute(cmd); onClose(); }}
                    >
                      <span className="flex items-center gap-2">
                        {cmd.icon}
                        {cmd.label}
                      </span>
                      {cmd.shortcut && <span className="text-xs text-ink-dim font-mono">{cmd.shortcut}</span>}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
