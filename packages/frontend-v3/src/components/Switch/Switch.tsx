import type { SwitchProps } from '../../types';

export function Switch({ checked, onChange, label, disabled = false }: SwitchProps) {
  return (
    <label className={`inline-flex items-center gap-2 text-sm text-ink-primary cursor-pointer ${disabled ? 'opacity-40 pointer-events-none' : ''}`}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={`relative inline-flex h-5 w-9 items-center rounded-full border transition-colors duration-[var(--duration-state)] ${checked ? 'bg-accent border-accent' : 'bg-surface border-border'}`}
        onClick={() => onChange(!checked)}
        disabled={disabled}
      >
        <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform duration-[var(--duration-state)] ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </button>
      {label}
    </label>
  );
}
