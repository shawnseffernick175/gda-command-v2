import type { TextareaProps } from '../../types';

export function Textarea({
  label,
  placeholder,
  value,
  onChange,
  error,
  helper,
  disabled = false,
  rows = 3,
}: TextareaProps) {
  const bordCls = error
    ? 'border-critical'
    : 'border-border hover:border-border-strong focus-within:border-accent';
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-xs text-ink-muted">{label}</label>}
      <textarea
        className={`rounded-sm border bg-surface px-2 py-2 text-sm text-ink-primary placeholder:text-ink-dim outline-none transition-colors ${bordCls} ${disabled ? 'opacity-50 bg-canvas pointer-events-none' : ''}`}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={rows}
        aria-invalid={!!error}
      />
      {error && <p className="text-xs text-critical">{error}</p>}
      {!error && helper && <p className="text-xs text-ink-muted">{helper}</p>}
    </div>
  );
}
