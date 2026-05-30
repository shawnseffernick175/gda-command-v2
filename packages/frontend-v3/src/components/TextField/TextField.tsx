import type { TextFieldProps } from '../../types';

export function TextField({
  type = 'text',
  label,
  placeholder,
  value,
  onChange,
  error,
  helper,
  disabled = false,
  prefix,
  suffix,
}: TextFieldProps) {
  const bordCls = error
    ? 'border-critical'
    : 'border-border hover:border-border-strong focus-within:border-accent';
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-xs text-ink-muted">{label}</label>}
      <div
        className={`flex items-center h-8 rounded-sm border bg-surface px-2 text-sm text-ink-primary transition-colors ${bordCls} ${disabled ? 'opacity-50 bg-canvas pointer-events-none' : ''}`}
      >
        {prefix && <span className="mr-2 text-ink-muted">{prefix}</span>}
        <input
          type={type}
          className="flex-1 bg-transparent outline-none placeholder:text-ink-dim"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-invalid={!!error}
          aria-describedby={error ? 'field-error' : helper ? 'field-helper' : undefined}
        />
        {suffix && <span className="ml-2 text-ink-muted">{suffix}</span>}
      </div>
      {error && <p id="field-error" className="text-xs text-critical">{error}</p>}
      {!error && helper && <p id="field-helper" className="text-xs text-ink-muted">{helper}</p>}
    </div>
  );
}
