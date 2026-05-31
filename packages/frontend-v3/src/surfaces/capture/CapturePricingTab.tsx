import { useState } from 'react';
import { Button } from '../../components/Button/Button';
import { PricingRow } from './components/PricingRow';
import { SourceLink } from './components/SourceLink';
import { useUpdateCapture } from './hooks/useUpdateCapture';
import type { CaptureDetail, LaborCategory } from './types';

interface CapturePricingTabProps {
  capture: CaptureDetail;
}

let nextTempId = 1;

export function CapturePricingTab({ capture }: CapturePricingTabProps) {
  const initialRows = capture.pricing?.labor_categories ?? [];
  const [rows, setRows] = useState<LaborCategory[]>(initialRows);
  const update = useUpdateCapture(capture.id);

  const addRow = () => {
    setRows((prev) => [...prev, { id: `temp-${nextTempId++}`, category: '', hours: 0, rate: 0 }]);
  };

  const updateRow = (idx: number, updated: LaborCategory) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? updated : r)));
  };

  const removeRow = (idx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = () => {
    update.mutate({
      pricing: {
        labor_categories: rows.map((r) => ({
          category: r.category,
          hours: r.hours,
          rate: r.rate,
        })),
      },
    });
  };

  const computedTotal = rows.reduce((sum, r) => sum + r.hours * r.rate, 0);
  const pricing = update.data?.pricing ?? capture.pricing;

  return (
    <div className="flex flex-col gap-6">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="text-xs uppercase tracking-[0.04em] text-ink-muted font-semibold px-2 py-2 text-left border-b border-border">Labor Category</th>
            <th className="text-xs uppercase tracking-[0.04em] text-ink-muted font-semibold px-2 py-2 text-left border-b border-border w-24">Hours</th>
            <th className="text-xs uppercase tracking-[0.04em] text-ink-muted font-semibold px-2 py-2 text-left border-b border-border w-28">Rate</th>
            <th className="text-xs uppercase tracking-[0.04em] text-ink-muted font-semibold px-2 py-2 text-right border-b border-border w-28">Total</th>
            <th className="text-xs uppercase tracking-[0.04em] text-ink-muted font-semibold px-2 py-2 border-b border-border w-12" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <PricingRow
              key={row.id}
              item={row}
              onChange={(u) => updateRow(idx, u)}
              onRemove={() => removeRow(idx)}
            />
          ))}
        </tbody>
      </table>

      <div className="flex items-center gap-4">
        <Button variant="secondary" size="sm" onClick={addRow}>Add Row</Button>
        <Button variant="primary" size="sm" onClick={handleSave} loading={update.isPending}>
          Save Pricing
        </Button>
      </div>

      {pricing && (
        <div className="flex flex-col gap-2 rounded-sm border border-border p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-ink-muted">Computed Total:</span>
            <a
              href={pricing.total_sources?.[0]?.url ?? capture.source_url ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              data-source-url={pricing.total_sources?.[0]?.url ?? capture.source_url ?? '#'}
              data-testid="data-point-pricing-total"
              className="text-sm font-semibold text-ink-primary hover:text-accent transition-colors"
            >
              ${computedTotal.toLocaleString()}
            </a>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-ink-muted">NAICS Benchmark Band:</span>
            <span className="flex items-center gap-2">
              <a
                href={pricing.benchmark_sources?.[0]?.url ?? capture.source_url ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                data-source-url={pricing.benchmark_sources?.[0]?.url ?? capture.source_url ?? '#'}
                data-testid="data-point-benchmark-band"
                className="text-sm text-ink-primary hover:text-accent transition-colors"
              >
                ${pricing.benchmark_band_low.toLocaleString()} – ${pricing.benchmark_band_high.toLocaleString()}
              </a>
              <SourceLink sources={pricing.benchmark_sources ?? []} />
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
