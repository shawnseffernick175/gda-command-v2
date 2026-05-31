import type { ComplianceRequirement } from '../types';
import { SourceLink } from './SourceLink';

interface ComplianceRowProps {
  requirement: ComplianceRequirement;
}

export function ComplianceRow({ requirement }: ComplianceRowProps) {
  return (
    <tr className="border-b border-border h-10">
      <td className="px-2 py-1.5 text-sm text-ink-primary">
        {requirement.requirement}
      </td>
      <td className="px-2 py-1.5 text-sm text-center">
        <span
          data-source-url={requirement.source_url}
          className={`inline-flex items-center h-6 px-2 rounded-full text-xs font-medium border border-transparent ${
            requirement.met
              ? 'bg-success/15 text-success'
              : 'bg-critical/15 text-critical'
          }`}
        >
          <a href={requirement.source_url} target="_blank" rel="noopener noreferrer">
            {requirement.met ? 'Met' : 'Unmet'}
          </a>
        </span>
      </td>
      <td className="px-2 py-1.5 text-sm text-ink-muted">
        {requirement.source_citation}
      </td>
      <td className="px-2 py-1.5">
        <SourceLink sources={requirement.source_url_sources} />
      </td>
    </tr>
  );
}
