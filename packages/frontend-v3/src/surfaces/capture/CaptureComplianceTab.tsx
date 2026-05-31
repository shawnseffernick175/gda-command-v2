import { ComplianceRow } from './components/ComplianceRow';
import type { CaptureDetail } from './types';

interface CaptureComplianceTabProps {
  capture: CaptureDetail;
}

export function CaptureComplianceTab({ capture }: CaptureComplianceTabProps) {
  const items = capture.compliance_items ?? [];
  const met = items.filter((r) => r.status === 'compliant').length;
  const total = items.length;
  const sources = capture.compliance_sources ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <span className="text-sm text-ink-muted">Coverage:</span>
        <a
          href={sources[0]?.url ?? capture.source_url ?? '#'}
          target="_blank"
          rel="noopener noreferrer"
          data-source-url={sources[0]?.url ?? capture.source_url ?? '#'}
          data-testid="data-point-compliance-coverage"
          className="text-sm font-medium text-ink-primary hover:text-accent transition-colors"
        >
          {Math.round((capture.compliance_coverage ?? 0) * 100)}% ({met}/{total})
        </a>
      </div>

      {total === 0 ? (
        <p className="text-sm text-ink-muted">No compliance requirements loaded.</p>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="text-xs uppercase tracking-[0.04em] text-ink-muted font-semibold px-2 py-2 text-left border-b border-border">Requirement</th>
              <th className="text-xs uppercase tracking-[0.04em] text-ink-muted font-semibold px-2 py-2 text-center border-b border-border w-24">Status</th>
              <th className="text-xs uppercase tracking-[0.04em] text-ink-muted font-semibold px-2 py-2 text-left border-b border-border">Evidence</th>
              <th className="text-xs uppercase tracking-[0.04em] text-ink-muted font-semibold px-2 py-2 text-left border-b border-border w-24">Source</th>
            </tr>
          </thead>
          <tbody>
            {items.map((req) => (
              <ComplianceRow key={req.id} requirement={req} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
