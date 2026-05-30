import type { CheckboxProps } from '../../types';

export function Checkbox({ checked, onChange, label, disabled = false, indeterminate = false }: CheckboxProps) {
  return (
    <label className={`inline-flex items-center gap-2 text-sm text-ink-primary cursor-pointer ${disabled ? 'opacity-40 pointer-events-none' : ''}`}>
      <span
        role="checkbox"
        aria-checked={indeterminate ? 'mixed' : checked}
        tabIndex={0}
        className={`inline-flex items-center justify-center w-4 h-4 rounded-sm border transition-colors duration-[var(--duration-state)] ${checked || indeterminate ? 'bg-accent border-accent' : 'border-border hover:border-border-strong'}`}
        onClick={() => onChange(!checked)}
        onKeyDown={(e) => { if (e.key === ' ') { e.preventDefault(); onChange(!checked); } }}
      >
        {checked && <svg viewBox="0 0 16 16" fill="none" className="w-3 h-3"><path d="M4 8l3 3 5-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
        {indeterminate && !checked && <svg viewBox="0 0 16 16" fill="none" className="w-3 h-3"><path d="M4 8h8" stroke="white" strokeWidth="2" strokeLinecap="round"/></svg>}
      </span>
      {label}
    </label>
  );
}
