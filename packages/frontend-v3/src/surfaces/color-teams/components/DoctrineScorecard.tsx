import type { DoctrineScoreRow } from '../types';

interface DoctrineScorecardProps {
  scores: DoctrineScoreRow[];
}

export function DoctrineScorecard({ scores }: DoctrineScorecardProps) {
  return (
    <div className="border border-border rounded-sm overflow-hidden">
      <div className="px-4 py-2 border-b border-border bg-surface-raised">
        <h4 className="text-xs font-semibold text-ink-muted uppercase tracking-wider">
          Doctrine Alignment Scorecard
        </h4>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left px-4 py-2 text-xs text-ink-muted uppercase tracking-wider font-medium">
              Principle
            </th>
            <th className="text-right px-4 py-2 text-xs text-ink-muted uppercase tracking-wider font-medium w-20">
              Score
            </th>
            <th className="text-left px-4 py-2 text-xs text-ink-muted uppercase tracking-wider font-medium">
              Detail
            </th>
          </tr>
        </thead>
        <tbody>
          {scores.map((row) => (
            <tr key={row.principle} className="border-b border-border last:border-b-0">
              <td className="px-4 py-2 text-ink-primary font-medium">{row.principle}</td>
              <td className="px-4 py-2 text-right tabular-nums">
                <span className={row.score >= 70 ? 'text-success' : 'text-warning'}>
                  {row.score}%
                </span>
              </td>
              <td className="px-4 py-2 text-ink-muted text-xs">{row.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
