/**
 * DoctrineQualifyGate — wraps the Qualify button.
 * Disables qualification when an exclusion is triggered or margin fails.
 * Shows override link for executive rationale.
 */

import { useState } from 'react';
import { Button } from '../../components/Button/Button';
import { useDoctrineEvaluation } from './hooks/useDoctrineEvaluation';
import { DoctrineOverrideModal } from './DoctrineOverrideModal';
import { apiFetch } from '../../lib/api-client';
import type { ExclusionResult } from './types';

interface DoctrineQualifyGateProps {
  opportunityId: string;
  status: string;
  onQualify: () => void;
}

export function DoctrineQualifyGate({ opportunityId, status, onQualify }: DoctrineQualifyGateProps) {
  const { latest } = useDoctrineEvaluation('opportunity', opportunityId);
  const [overrideModal, setOverrideModal] = useState<{ open: boolean; exclusion: ExclusionResult | null }>({
    open: false,
    exclusion: null,
  });
  const [overrideGranted, setOverrideGranted] = useState(false);

  if (status === 'qualified') return null;

  const triggeredExclusions = latest?.exclusion_triggers.filter(e => e.triggered) ?? [];
  const marginFailed = latest?.margin_check && !latest.margin_check.passed;
  const isBlocked = (triggeredExclusions.length > 0 || marginFailed) && !overrideGranted;

  const handleOverride = async (rationale: string) => {
    try {
      await apiFetch('/v3/doctrine/override', {
        method: 'POST',
        body: JSON.stringify({
          entity_kind: 'opportunity',
          entity_id: opportunityId,
          kind: 'exclusion_override',
          rationale,
          exclusion_ids: triggeredExclusions.map(e => e.id),
        }),
      });
      setOverrideGranted(true);
    } catch {
      // Error handled by ApiError
    }
  };

  return (
    <div className="flex flex-col items-end gap-2">
      {isBlocked && (
        <div className="text-right">
          <p className="text-xs text-critical font-medium">
            {triggeredExclusions.length > 0
              ? `Blocked: ${triggeredExclusions.map(e => e.name).join(', ')}`
              : `Margin ${latest?.margin_check.margin_pct}% below ${latest?.margin_check.threshold}% floor`
            }
          </p>
          <button
            type="button"
            className="text-xs text-accent hover:underline mt-1"
            onClick={() => setOverrideModal({
              open: true,
              exclusion: triggeredExclusions[0] ?? null,
            })}
          >
            Override with rationale
          </button>
        </div>
      )}

      <Button
        variant="primary"
        onClick={onQualify}
        disabled={isBlocked === true}
      >
        Qualify
      </Button>

      <DoctrineOverrideModal
        open={overrideModal.open}
        onClose={() => setOverrideModal({ open: false, exclusion: null })}
        onConfirm={handleOverride}
        title="Doctrine Override Required"
        description={
          triggeredExclusions.length > 0
            ? `This pursuit triggers: ${triggeredExclusions.map(e => e.name).join(', ')}. Provide executive rationale to override.`
            : `Margin is below the ${latest?.margin_check.threshold ?? 8}% floor. Provide executive rationale to override.`
        }
      />
    </div>
  );
}
