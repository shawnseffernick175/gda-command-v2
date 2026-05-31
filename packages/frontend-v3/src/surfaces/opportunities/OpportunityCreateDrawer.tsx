import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog } from '../../components/Dialog/Dialog';
import { Button } from '../../components/Button/Button';
import type { OpportunityCreateInput, OpportunitySummary, SuccessEnvelope } from './types';

interface OpportunityCreateDrawerProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (id: string) => void;
}

const INITIAL_FORM: OpportunityCreateInput = {
  title: '',
  source: '',
  agency: '',
  naics: '',
  set_aside: '',
  description: '',
  response_due_at: '',
};

async function createOpportunity(input: OpportunityCreateInput): Promise<OpportunitySummary> {
  const body: Record<string, unknown> = { title: input.title, source: input.source };
  if (input.agency) body.agency = input.agency;
  if (input.naics) body.naics = input.naics;
  if (input.set_aside) body.set_aside = input.set_aside;
  if (input.description) body.description = input.description;
  if (input.response_due_at) body.response_due_at = input.response_due_at;
  if (input.sam_notice_id) body.sam_notice_id = input.sam_notice_id;
  if (input.sub_agency) body.sub_agency = input.sub_agency;
  if (input.posted_at) body.posted_at = input.posted_at;
  if (input.value_min !== undefined) body.value_min = input.value_min;
  if (input.value_max !== undefined) body.value_max = input.value_max;

  const res = await fetch('/v3/opportunities', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Create failed: ${res.status}`);
  }
  const envelope = (await res.json()) as SuccessEnvelope<OpportunitySummary>;
  return envelope.data;
}

export function OpportunityCreateDrawer({ open, onClose, onCreated }: OpportunityCreateDrawerProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<OpportunityCreateInput>({ ...INITIAL_FORM });

  const mutation = useMutation({
    mutationFn: createOpportunity,
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['opportunities'] });
      onCreated?.(data.id);
      setForm({ ...INITIAL_FORM });
      onClose();
    },
  });

  function update(field: keyof OpportunityCreateInput, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit() {
    if (!form.title.trim() || !form.source.trim()) return;
    mutation.mutate(form);
  }

  const fieldClass = 'h-8 w-full rounded-sm border border-border bg-surface px-2 text-sm text-ink-primary';

  return (
    <Dialog open={open} onClose={onClose} title="New Opportunity" size="lg" footer={
      <>
        <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleSubmit}
          loading={mutation.isPending}
          disabled={!form.title.trim() || !form.source.trim()}
        >
          Create
        </Button>
      </>
    }>
      <div className="flex flex-col gap-4">
        {mutation.isError && (
          <div className="rounded-sm border border-critical/30 bg-critical/10 px-3 py-2 text-xs text-critical">
            {mutation.error.message}
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label className="text-xs text-ink-muted">Title *</label>
          <input
            className={fieldClass}
            value={form.title}
            onChange={(e) => update('title', e.target.value)}
            placeholder="Opportunity title"
            data-testid="create-title"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-ink-muted">Source URL *</label>
          <input
            className={fieldClass}
            value={form.source}
            onChange={(e) => update('source', e.target.value)}
            placeholder="https://sam.gov/opp/..."
            data-testid="create-source"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-ink-muted">Agency</label>
            <input
              className={fieldClass}
              value={form.agency ?? ''}
              onChange={(e) => update('agency', e.target.value)}
              placeholder="e.g. Army"
              data-testid="create-agency"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-ink-muted">NAICS</label>
            <input
              className={fieldClass}
              value={form.naics ?? ''}
              onChange={(e) => update('naics', e.target.value)}
              placeholder="e.g. 541512"
              data-testid="create-naics"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-ink-muted">Set-Aside</label>
            <input
              className={fieldClass}
              value={form.set_aside ?? ''}
              onChange={(e) => update('set_aside', e.target.value)}
              placeholder="e.g. Total Small Business"
              data-testid="create-set-aside"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-ink-muted">Response Due</label>
            <input
              type="date"
              className={fieldClass}
              value={form.response_due_at ?? ''}
              onChange={(e) => update('response_due_at', e.target.value)}
              data-testid="create-response-due"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-ink-muted">Description</label>
          <textarea
            className="w-full rounded-sm border border-border bg-surface px-2 py-2 text-sm text-ink-primary min-h-[80px]"
            value={form.description ?? ''}
            onChange={(e) => update('description', e.target.value)}
            placeholder="Brief description…"
            data-testid="create-description"
          />
        </div>
      </div>
    </Dialog>
  );
}
