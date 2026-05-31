import { TeamingRow } from './components/TeamingRow';
import type { CaptureDetail } from './types';

interface CaptureTeamingTabProps {
  capture: CaptureDetail;
}

export function CaptureTeamingTab({ capture }: CaptureTeamingTabProps) {
  return (
    <div className="flex flex-col gap-6">
      {capture.teaming_partners.length === 0 ? (
        <p className="text-sm text-ink-muted">No teaming partners assigned.</p>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="text-xs uppercase tracking-[0.04em] text-ink-muted font-semibold px-2 py-2 text-left border-b border-border">Partner</th>
              <th className="text-xs uppercase tracking-[0.04em] text-ink-muted font-semibold px-2 py-2 text-left border-b border-border w-28">Role</th>
              <th className="text-xs uppercase tracking-[0.04em] text-ink-muted font-semibold px-2 py-2 text-left border-b border-border w-24">Source</th>
            </tr>
          </thead>
          <tbody>
            {capture.teaming_partners.map((partner) => (
              <TeamingRow key={partner.id} partner={partner} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
