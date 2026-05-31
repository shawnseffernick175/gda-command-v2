import type { TeamingPartner } from '../types';
import { SourceLink } from './SourceLink';

const roleConfig: Record<TeamingPartner['role'], string> = {
  prime: 'bg-accent/15 text-accent',
  sub: 'bg-surface-raised text-ink-primary',
  mentor: 'bg-warning/15 text-warning',
  protege: 'bg-warning/15 text-warning',
  teaming: 'bg-success/15 text-success',
};

interface TeamingRowProps {
  partner: TeamingPartner;
  onOpenPipelineEditor?: () => void;
}

export function TeamingRow({ partner, onOpenPipelineEditor }: TeamingRowProps) {
  return (
    <tr className="border-b border-border h-10">
      <td className="px-2 py-1.5 text-sm text-ink-primary">
        {onOpenPipelineEditor ? (
          <button
            type="button"
            onClick={onOpenPipelineEditor}
            className="text-accent hover:underline"
          >
            {partner.name}
          </button>
        ) : (
          partner.name
        )}
      </td>
      <td className="px-2 py-1.5">
        <a
          href={partner.source_url ?? '#'}
          target="_blank"
          rel="noopener noreferrer"
          data-source-url={partner.source_url ?? '#'}
          className={`inline-flex items-center h-6 px-2 rounded-full text-xs font-medium border border-transparent ${roleConfig[partner.role]}`}
        >
          {partner.role}
        </a>
      </td>
      <td className="px-2 py-1.5">
        <SourceLink sources={partner.source_url_sources ?? []} />
      </td>
    </tr>
  );
}
