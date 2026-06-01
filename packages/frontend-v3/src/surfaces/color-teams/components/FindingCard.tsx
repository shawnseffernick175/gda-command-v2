import { useState } from 'react';
import { Button } from '../../../components/Button/Button';
import { SeverityChip } from './SeverityChip';
import { CitationChip } from './CitationChip';
import type { ColorTeamFinding } from '../types';
import { sendFindingToActionItem } from '../api';

interface FindingCardProps {
  finding: ColorTeamFinding;
  onActionItemCreated?: (findingId: string, actionItemId: string) => void;
}

export function FindingCard({ finding, onActionItemCreated }: FindingCardProps) {
  const [sending, setSending] = useState(false);
  const [linked, setLinked] = useState(!!finding.action_item_id);

  const handleSendToActionItem = async () => {
    setSending(true);
    try {
      const result = await sendFindingToActionItem(finding.id);
      setLinked(true);
      onActionItemCreated?.(finding.id, result.action_item_id);
    } catch {
      // error handled by apiFetch
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="border border-border rounded-sm p-4 bg-surface">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <SeverityChip severity={finding.severity} />
          {finding.section_ref && (
            <span className="text-xs text-ink-muted font-medium">{finding.section_ref}</span>
          )}
        </div>
        <div className="flex-shrink-0">
          {linked ? (
            <span className="text-xs text-success font-medium">Sent to Action Items</span>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleSendToActionItem}
              loading={sending}
              disabled={sending}
            >
              Send to Action Items
            </Button>
          )}
        </div>
      </div>

      <p className="text-sm text-ink-primary mb-2">{finding.finding}</p>

      {finding.recommended_fix && (
        <p className="text-sm text-ink-muted mb-2">
          <span className="font-medium text-ink-primary">Fix: </span>
          {finding.recommended_fix}
        </p>
      )}

      {finding.citations.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          {finding.citations.map((c, i) => (
            <CitationChip key={i} citation={c} />
          ))}
        </div>
      )}
    </div>
  );
}
