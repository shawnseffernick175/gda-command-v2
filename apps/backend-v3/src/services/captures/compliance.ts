/**
 * Compliance matrix utilities.
 */

export type ComplianceStatus = 'compliant' | 'partial' | 'non_compliant';

export interface ComplianceItem {
  id: string;
  requirement: string;
  status: ComplianceStatus;
  response_notes: string | null;
}

export interface ComplianceSummary {
  compliant: number;
  partial: number;
  non_compliant: number;
}

export function computeComplianceSummary(
  items: ComplianceItem[]
): ComplianceSummary {
  const summary: ComplianceSummary = { compliant: 0, partial: 0, non_compliant: 0 };
  for (const item of items) {
    if (item.status === 'compliant') summary.compliant++;
    else if (item.status === 'partial') summary.partial++;
    else if (item.status === 'non_compliant') summary.non_compliant++;
  }
  return summary;
}

export function isValidComplianceStatus(s: string): s is ComplianceStatus {
  return s === 'compliant' || s === 'partial' || s === 'non_compliant';
}
