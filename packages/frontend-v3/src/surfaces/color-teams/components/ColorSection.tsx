import { useState } from 'react';
import { FindingCard } from './FindingCard';
import { DoctrineScorecard } from './DoctrineScorecard';
import { MarginGauge } from './MarginGauge';
import { ExclusionBanner } from './ExclusionBanner';
import type { ColorTeamFinding, ColorTeamColor } from '../types';

const colorLabels: Record<ColorTeamColor, string> = {
  pink: 'Pink — Storyboard / Outline',
  red: 'Red — Draft Proposal Evaluation',
  black: 'Black — Adversarial Competitor Sim',
  blue: 'Blue — Customer Perspective',
  white: 'White — Compliance Sweep',
  green: 'Green — Executive / Final Pass',
};

interface ColorSectionProps {
  color: ColorTeamColor;
  findings: ColorTeamFinding[];
  defaultExpanded?: boolean;
}

export function ColorSection({ color, findings, defaultExpanded = false }: ColorSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const greenFinding = color === 'green' ? findings.find((f) => f.doctrine_score) : null;
  const greenMarginFinding = color === 'green' ? findings.find((f) => f.margin_check) : null;
  const allExclusions = color === 'green'
    ? findings.flatMap((f) => f.exclusion_hits ?? [])
    : [];

  return (
    <div className="border border-border rounded-sm bg-surface overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 bg-surface-raised hover:bg-surface transition-colors duration-[var(--duration-state)]"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-sm font-semibold text-ink-primary">
          {colorLabels[color]}
        </span>
        <span className="flex items-center gap-2">
          <span className="text-xs text-ink-muted">
            {findings.length} finding{findings.length !== 1 ? 's' : ''}
          </span>
          <span className="text-ink-muted text-xs">{expanded ? '\u25B2' : '\u25BC'}</span>
        </span>
      </button>

      {expanded && (
        <div className="p-4 flex flex-col gap-3">
          {color === 'green' && allExclusions.length > 0 && (
            <ExclusionBanner exclusionHits={[...new Set(allExclusions)]} />
          )}

          {greenMarginFinding?.margin_check && (
            <MarginGauge margin={greenMarginFinding.margin_check} />
          )}

          {greenFinding?.doctrine_score && (
            <DoctrineScorecard scores={greenFinding.doctrine_score} />
          )}

          {findings.map((f) => (
            <FindingCard key={f.id} finding={f} />
          ))}

          {findings.length === 0 && (
            <p className="text-sm text-ink-muted italic">No findings for this color.</p>
          )}
        </div>
      )}
    </div>
  );
}
