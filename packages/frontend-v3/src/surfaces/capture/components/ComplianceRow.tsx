import type { ComplianceRequirement } from '../types';
import { SourceLink } from './SourceLink';

interface ComplianceRowProps {
  requirement: ComplianceRequirement;
}

export function ComplianceRow({ requirement }: ComplianceRowProps) {
  const isCompliant = requirement.status === 'compliant';

  return (
    <tr className="border-b border-border h-10">
      <td className="px-2 py-1.5 text-sm text-ink-primary">
        {requirement.requirement}
      </td>
      <td className="px-2 py-1.5 text-sm text-center">
        <a
          href={requirement.source_url ?? '#'}
          target="_blank"
          rel="noopener noreferrer"
          data-source-url={requirement.source_url ?? '#'}
          className={`inline-flex items-center h-6 px-2 rounded-full text-xs font-medium border border-transparent ${
            isCompliant
              ? 'bg-success/15 text-success'
              : 'bg-critical/15 text-critical'
          }`}
        >
          {isCompliant ? 'Compliant' : requirement.status}
        </a>
      </td>
      <td className="px-2 py-1.5 text-sm text-ink-muted">
        {requirement.evidence}
      </td>
      <td className="px-2 py-1.5">
        <SourceLink sources={requirement.source_url_sources ?? []} />
      </td>
    </tr>
  );
}
