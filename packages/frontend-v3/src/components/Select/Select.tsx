import { useState, useRef, useEffect } from 'react';
import type { SelectProps } from '../../types';

export function Select<T extends string = string>({
  label,
  options,
  value,
  onChange,
  placeholder = 'Select…',
  searchable = false,
  disabled = false,
}: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = searchable
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  return (
    <div ref={ref} className="relative flex flex-col gap-1">
      {label && <label className="text-xs text-ink-muted">{label}</label>}
      <button
        type="button"
        className={`flex items-center justify-between h-8 rounded-sm border border-border bg-surface px-2 text-sm text-ink-primary hover:border-border-strong transition-colors ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={disabled}
      >
        <span className={selected ? '' : 'text-ink-dim'}>{selected ? selected.label : placeholder}</span>
        <span className="text-ink-muted ml-2">▾</span>
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-20 rounded-md border border-border bg-surface-raised max-h-60 overflow-y-auto" role="listbox">
          {searchable && (
            <input
              className="w-full px-2 py-1 text-sm bg-transparent border-b border-border outline-none text-ink-primary placeholder:text-ink-dim"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          )}
          {filtered.map((opt) => (
            <div
              key={String(opt.value)}
              role="option"
              aria-selected={opt.value === value}
              className={`px-2 py-1.5 text-sm cursor-pointer hover:bg-surface ${opt.disabled ? 'opacity-50 pointer-events-none' : ''} ${opt.value === value ? 'text-accent' : 'text-ink-primary'}`}
              onClick={() => { onChange(opt.value); setOpen(false); setSearch(''); }}
            >
              {opt.label}
              {opt.value === value && <span className="ml-2 inline-block w-2.5 h-1.5 border-b-2 border-l-2 border-current -rotate-45 -translate-y-0.5" aria-hidden="true" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
