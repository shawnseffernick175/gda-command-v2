import { useState } from 'react';
import { Inspector, Select, Button } from '../../components';
import type { ActionItem, ActionItemStatus } from './types';
import { StatusChip } from './components/StatusChip';
import { SourceChip } from './components/SourceChip';
import { SourceLink } from './components/SourceLink';
import { SuggestedResponseEditor } from './SuggestedResponseEditor';
import { TerminalStatusConfirmModal } from './TerminalStatusConfirmModal';
import { useUpdateActionItem } from './hooks/useUpdateActionItem';

interface ActionItemDetailDrawerProps {
  item: ActionItem | null;
  open: boolean;
  onClose: () => void;
}

const STATUS_OPTIONS: { value: ActionItemStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
];

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function ActionItemDetailDrawer({ item, open, onClose }: ActionItemDetailDrawerProps) {
  const updateMutation = useUpdateActionItem();
  const [confirmStatus, setConfirmStatus] = useState<ActionItemStatus | null>(null);
  const [dueDateInput, setDueDateInput] = useState('');
  const [notesInput, setNotesInput] = useState('');

  if (!item) return null;

  const latestDraft = item.drafts.length > 0 ? item.drafts[0]! : null;

  const handleStatusChange = (newStatus: ActionItemStatus) => {
    if (newStatus === 'done') {
      setConfirmStatus(newStatus);
      return;
    }
    updateMutation.mutate({ id: item.id, payload: { status: newStatus } });
  };

  const handleConfirmStatus = () => {
    if (!confirmStatus) return;
    updateMutation.mutate(
      { id: item.id, payload: { status: confirmStatus } },
      { onSettled: () => setConfirmStatus(null) },
    );
  };

  const handleDueDateSave = () => {
    if (!dueDateInput) return;
    updateMutation.mutate({ id: item.id, payload: { due_date: dueDateInput } });
  };

  return (
    <>
      <Inspector open={open} onClose={onClose} title="Action Item Detail">
        <div className="flex flex-col gap-6" data-testid="action-item-detail">
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold text-ink-primary">{item.title}</h3>
            {item.detail && (
              <p className="text-sm text-ink-muted">{item.detail}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-ink-muted w-20">Source</span>
              <SourceChip source={item.source} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-ink-muted w-20">Source Link</span>
              <SourceLink
                linkedRecordType={item.linked_record_type}
                linkedRecordId={item.linked_record_id}
                source={item.source}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-ink-muted w-20">Status</span>
              <StatusChip status={item.status} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-ink-muted w-20">Owner</span>
              <span className="text-sm text-ink-primary">{item.owner}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-ink-muted w-20">Due</span>
              <span className="text-sm text-ink-primary">{formatDate(item.due_date)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-ink-muted w-20">Created</span>
              <span className="text-sm text-ink-muted">{formatDate(item.created_at)}</span>
            </div>
          </div>

          <div className="flex flex-col gap-2 border-t border-border pt-4">
            <label className="text-xs uppercase tracking-[0.04em] text-ink-muted font-semibold">
              Update Status
            </label>
            <Select
              options={STATUS_OPTIONS}
              value={item.status}
              onChange={handleStatusChange}
            />
          </div>

          <div className="flex flex-col gap-2 border-t border-border pt-4">
            <label className="text-xs uppercase tracking-[0.04em] text-ink-muted font-semibold">
              Due Date
            </label>
            <div className="flex gap-2">
              <input
                type="date"
                className="flex-1 h-8 rounded-sm border border-border bg-surface px-2 text-sm text-ink-primary"
                value={dueDateInput || item.due_date?.split('T')[0] || ''}
                onChange={(e) => setDueDateInput(e.target.value)}
              />
              <Button variant="secondary" size="sm" onClick={handleDueDateSave} disabled={!dueDateInput}>
                Save
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2 border-t border-border pt-4">
            <label className="text-xs uppercase tracking-[0.04em] text-ink-muted font-semibold">
              Notes
            </label>
            <textarea
              className="w-full rounded-sm border border-border bg-surface px-3 py-2 text-sm text-ink-primary resize-y min-h-[80px]"
              placeholder="Add notes..."
              value={notesInput}
              onChange={(e) => setNotesInput(e.target.value)}
              rows={3}
            />
          </div>

          <div className="border-t border-border pt-4">
            <SuggestedResponseEditor item={item} draft={latestDraft} />
          </div>
        </div>
      </Inspector>

      <TerminalStatusConfirmModal
        open={confirmStatus !== null}
        targetStatus={confirmStatus}
        onConfirm={handleConfirmStatus}
        onCancel={() => setConfirmStatus(null)}
        loading={updateMutation.isPending}
      />
    </>
  );
}
