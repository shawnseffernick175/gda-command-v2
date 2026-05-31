import { apiFetch } from '../../lib/api-client';
import type {
  DoctrineEvaluation,
  DoctrinePrinciple,
  DoctrineExclusion,
  DoctrineConfigRow,
} from './types';

export async function runDoctrineCheck(
  entityKind: string,
  entityId: string,
  context?: Record<string, unknown>,
): Promise<DoctrineEvaluation> {
  return apiFetch<DoctrineEvaluation>('/v3/doctrine/check', {
    method: 'POST',
    body: JSON.stringify({ entity_kind: entityKind, entity_id: entityId, context }),
  });
}

export async function fetchDoctrineEvaluations(
  entityKind: string,
  entityId: string,
): Promise<DoctrineEvaluation[]> {
  return apiFetch<DoctrineEvaluation[]>(
    `/v3/doctrine/evaluations?entity_kind=${encodeURIComponent(entityKind)}&entity_id=${encodeURIComponent(entityId)}`
  );
}

export async function fetchPrinciples(): Promise<DoctrinePrinciple[]> {
  return apiFetch<DoctrinePrinciple[]>('/v3/doctrine/principles');
}

export async function fetchExclusions(): Promise<DoctrineExclusion[]> {
  return apiFetch<DoctrineExclusion[]>('/v3/doctrine/exclusions');
}

export async function fetchDoctrineConfig(): Promise<DoctrineConfigRow[]> {
  return apiFetch<DoctrineConfigRow[]>('/v3/doctrine/config');
}

export async function updateDoctrineConfig(
  key: string,
  value: unknown,
): Promise<DoctrineConfigRow> {
  return apiFetch<DoctrineConfigRow>(`/v3/doctrine/config/${encodeURIComponent(key)}`, {
    method: 'PATCH',
    body: JSON.stringify({ value }),
  });
}
