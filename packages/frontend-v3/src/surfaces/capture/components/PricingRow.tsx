import type { LaborCategory } from '../types';

interface PricingRowProps {
  item: LaborCategory;
  onChange: (updated: LaborCategory) => void;
  onRemove: () => void;
}

export function PricingRow({ item, onChange, onRemove }: PricingRowProps) {
  const lineTotal = item.hours * item.rate;

  return (
    <tr className="border-b border-border h-10">
      <td className="px-2 py-1.5">
        <input
          type="text"
          value={item.category}
          onChange={(e) => onChange({ ...item, category: e.target.value })}
          className="w-full bg-transparent border border-border rounded-sm px-2 py-1 text-sm text-ink-primary"
          aria-label="Labor category"
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          type="number"
          value={item.hours}
          onChange={(e) => onChange({ ...item, hours: Number(e.target.value) })}
          className="w-20 bg-transparent border border-border rounded-sm px-2 py-1 text-sm text-ink-primary text-right"
          aria-label="Hours"
          min={0}
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          type="number"
          value={item.rate}
          onChange={(e) => onChange({ ...item, rate: Number(e.target.value) })}
          className="w-24 bg-transparent border border-border rounded-sm px-2 py-1 text-sm text-ink-primary text-right"
          aria-label="Rate"
          min={0}
          step={0.01}
        />
      </td>
      <td className="px-2 py-1.5 text-sm text-ink-primary text-right font-[var(--font-numeric)]">
        ${lineTotal.toLocaleString()}
      </td>
      <td className="px-2 py-1.5">
        <button
          type="button"
          onClick={onRemove}
          className="text-ink-muted hover:text-ink-primary text-sm"
          aria-label={`Remove ${item.category}`}
        >
          ×
        </button>
      </td>
    </tr>
  );
}
