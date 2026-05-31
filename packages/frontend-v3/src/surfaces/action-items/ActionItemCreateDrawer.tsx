import { useState } from 'react';
import { Inspector, Button, TextField } from '../../components';
import { useCreateActionItem } from './hooks/useCreateActionItem';

interface ActionItemCreateDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function ActionItemCreateDrawer({ open, onClose }: ActionItemCreateDrawerProps) {
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [dueDate, setDueDate] = useState('');
  const createMutation = useCreateActionItem();

  const handleSubmit = () => {
    if (!title.trim()) return;
    const payload: Parameters<typeof createMutation.mutate>[0] = {
      title: title.trim(),
      owner: 'Shawn',
      source: 'manual',
    };
    if (detail.trim()) payload.detail = detail.trim();
    if (dueDate) payload.due_date = dueDate;
    createMutation.mutate(
      payload,
      {
        onSuccess: () => {
          setTitle('');
          setDetail('');
          setDueDate('');
          onClose();
        },
      },
    );
  };

  return (
    <Inspector open={open} onClose={onClose} title="New Action Item">
      <div className="flex flex-col gap-4" data-testid="action-item-create-form">
        <TextField
          label="Title"
          value={title}
          onChange={setTitle}
          placeholder="Enter action item title"
        />
        <div className="flex flex-col gap-1">
          <label className="text-xs text-ink-muted">Detail</label>
          <textarea
            className="w-full rounded-sm border border-border bg-surface px-3 py-2 text-sm text-ink-primary resize-y min-h-[80px]"
            placeholder="Optional description..."
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            rows={3}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-ink-muted">Due Date</label>
          <input
            type="date"
            className="h-8 rounded-sm border border-border bg-surface px-2 text-sm text-ink-primary"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
        <div className="flex gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={!title.trim()}
            loading={createMutation.isPending}
          >
            Create
          </Button>
        </div>
      </div>
    </Inspector>
  );
}
