import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '../../components/Button/Button';
import { SentinelBanner } from './components/SentinelBanner';
import { fetchPartners } from './api';
import type { TeamingRole, PipelinePartner, PartnerDirectoryEntry } from './types';
import { TEAMING_LABELS } from './types';

interface TeamingEditorProps {
  teaming: TeamingRole;
  partners: PipelinePartner[];
  onSave: (teaming: TeamingRole, partners: PipelinePartner[]) => void;
  disabled?: boolean | undefined;
}

const TEAMING_OPTIONS: TeamingRole[] = [
  'prime',
  'sub',
  'self-perform',
  'undecided',
];

export function TeamingEditor({
  teaming,
  partners,
  onSave,
  disabled = false,
}: TeamingEditorProps) {
  const [localTeaming, setLocalTeaming] = useState<TeamingRole>(teaming);
  const [localPartners, setLocalPartners] =
    useState<PipelinePartner[]>(partners);

  useEffect(() => {
    setLocalTeaming(teaming);
    setLocalPartners(partners);
  }, [teaming, partners]);

  const { data: partnerDir } = useQuery({
    queryKey: ['partners'],
    queryFn: fetchPartners,
  });

  const addPartner = (partnerId: string) => {
    const entry = partnerDir?.data.find((p) => p.id === partnerId);
    if (!entry) return;
    if (localPartners.some((lp: PipelinePartner) => lp.id === partnerId)) return;
    setLocalPartners([
      ...localPartners,
      {
        id: entry.id,
        name: entry.name,
        role: 'partner',
        source_url: entry.source_url,
      },
    ]);
  };

  const removePartner = (partnerId: string) => {
    setLocalPartners(localPartners.filter((p) => p.id !== partnerId));
  };

  const dirty =
    localTeaming !== teaming ||
    JSON.stringify(localPartners) !== JSON.stringify(partners);

  return (
    <div className="flex flex-col gap-4" data-testid="teaming-editor">
      <SentinelBanner />

      <div className="flex flex-col gap-1">
        <label className="text-xs text-ink-muted">Teaming Role</label>
        <select
          value={localTeaming}
          onChange={(e) => setLocalTeaming(e.target.value as TeamingRole)}
          disabled={disabled}
          className="h-8 rounded-sm border border-border bg-surface px-2 text-sm text-ink-primary"
          aria-label="Teaming role"
        >
          {TEAMING_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {TEAMING_LABELS[t]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-xs text-ink-muted">Partners</label>
        {localPartners.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between rounded-sm border border-border bg-surface px-3 py-2"
            data-testid="partner-row"
          >
            <span className="text-sm text-ink-primary">
              {p.name}
              {p.source_url && (
                <a
                  href={p.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-2 text-xs text-ink-muted hover:text-accent"
                  data-source-url={p.source_url}
                >
                  source &rarr;
                </a>
              )}
            </span>
            <button
              type="button"
              className="text-ink-muted hover:text-ink-primary text-sm"
              onClick={() => removePartner(p.id)}
              aria-label={`Remove ${p.name}`}
              disabled={disabled}
            >
              &times;
            </button>
          </div>
        ))}

        {partnerDir && partnerDir.data.length > 0 && (
          <select
            className="h-8 rounded-sm border border-border bg-surface px-2 text-sm text-ink-primary"
            onChange={(e) => {
              addPartner(e.target.value);
              e.target.value = '';
            }}
            defaultValue=""
            disabled={disabled}
            aria-label="Add partner"
          >
            <option value="" disabled>
              Add partner...
            </option>
            {partnerDir.data
              .filter((d: PartnerDirectoryEntry) => !localPartners.some((lp: PipelinePartner) => lp.id === d.id))
              .map((d: PartnerDirectoryEntry) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
          </select>
        )}
      </div>

      <Button
        variant="primary"
        disabled={!dirty || disabled}
        onClick={() => onSave(localTeaming, localPartners)}
      >
        Save Teaming
      </Button>
    </div>
  );
}
