import type { SliderProps } from '../../types';

export function Slider({ min, max, value, onChange, step = 1, label, disabled = false }: SliderProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <div className="flex justify-between text-xs text-ink-muted">
          <span>{label}</span>
          <span data-numeric>{value}</span>
        </div>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className={`w-full accent-[var(--color-accent)] ${disabled ? 'opacity-40' : ''}`}
      />
    </div>
  );
}
