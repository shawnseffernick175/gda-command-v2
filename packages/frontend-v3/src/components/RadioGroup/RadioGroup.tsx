import type { RadioGroupProps } from '../../types';

export function RadioGroup<T extends string = string>({ value, onChange, options, name }: RadioGroupProps<T>) {
  return (
    <div role="radiogroup" className="flex flex-col gap-2">
      {options.map((opt) => (
        <label
          key={String(opt.value)}
          className={`inline-flex items-center gap-2 text-sm text-ink-primary cursor-pointer ${opt.disabled ? 'opacity-40 pointer-events-none' : ''}`}
        >
          <span
            role="radio"
            aria-checked={opt.value === value}
            tabIndex={0}
            className={`inline-flex items-center justify-center w-4 h-4 rounded-full border transition-colors duration-[var(--duration-state)] ${opt.value === value ? 'border-accent' : 'border-border hover:border-border-strong'}`}
            onClick={() => !opt.disabled && onChange(opt.value)}
            onKeyDown={(e) => { if (e.key === ' ') { e.preventDefault(); if (!opt.disabled) onChange(opt.value); } }}
          >
            {opt.value === value && <span className="w-2 h-2 rounded-full bg-accent" />}
          </span>
          <input type="radio" name={name} value={String(opt.value)} checked={opt.value === value} onChange={() => onChange(opt.value)} className="sr-only" />
          {opt.label}
        </label>
      ))}
    </div>
  );
}
