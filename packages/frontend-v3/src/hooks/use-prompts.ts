import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPut, apiPost } from "@/lib/api";

export interface PromptVariable {
  name: string;
  description?: string;
  example?: string;
}

export interface Prompt {
  id: number;
  prompt_key: string;
  display_name: string;
  description: string | null;
  surface: string;
  system_prompt: string;
  user_prompt_template: string | null;
  variables: PromptVariable[] | null;
  is_active: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface PromptVersion {
  id: number;
  prompt_id: number;
  version: number;
  system_prompt: string;
  user_prompt_template: string | null;
  changed_by: string;
  change_note: string | null;
  created_at: string;
}

interface PromptsResponse {
  items: Prompt[];
  total: number;
}

interface VersionsResponse {
  items: PromptVersion[];
  total: number;
}

interface TestResult {
  input_prompt: string;
  raw_output: string;
  tokens_used: number;
  model_used: string;
  duration_ms: number;
}

export function usePrompts(params: { surface?: string; q?: string } = {}) {
  return useQuery({
    queryKey: ["prompts", params],
    queryFn: () =>
      apiGet<PromptsResponse>("/v3/prompts", params as Record<string, string>),
  });
}

export function usePrompt(key: string | null) {
  return useQuery({
    queryKey: ["prompt", key],
    queryFn: () => apiGet<Prompt>(`/v3/prompts/${key}`),
    enabled: !!key,
  });
}

export function useUpdatePrompt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      key,
      ...body
    }: {
      key: string;
      system_prompt: string;
      user_prompt_template?: string;
      change_note?: string;
    }) => apiPut<Prompt>(`/v3/prompts/${key}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["prompts"] });
      void qc.invalidateQueries({ queryKey: ["prompt"] });
    },
  });
}

export function useTestPrompt() {
  return useMutation({
    mutationFn: ({
      key,
      variable_values,
    }: {
      key: string;
      variable_values: Record<string, string>;
    }) => apiPost<TestResult>(`/v3/prompts/${key}/test`, { variable_values }),
  });
}

export function usePromptVersions(key: string | null) {
  return useQuery({
    queryKey: ["prompt-versions", key],
    queryFn: () => apiGet<VersionsResponse>(`/v3/prompts/${key}/versions`),
    enabled: !!key,
  });
}

export function useRestoreVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, version }: { key: string; version: number }) =>
      apiPost<Prompt>(`/v3/prompts/${key}/restore/${version}`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["prompts"] });
      void qc.invalidateQueries({ queryKey: ["prompt"] });
      void qc.invalidateQueries({ queryKey: ["prompt-versions"] });
    },
  });
}

export interface BuildResult {
  system_prompt: string;
  user_prompt_template: string;
  suggested_variables: PromptVariable[];
  display_name: string;
  model_used: string;
}

export function usePromptBuild() {
  return useMutation({
    mutationFn: (params: { topic: string; points: string[]; surface: string }) =>
      apiPost<BuildResult>("/v3/prompts/build", params),
  });
}

export function useCreatePrompt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      prompt_key: string;
      display_name: string;
      description?: string;
      surface: string;
      system_prompt: string;
      user_prompt_template?: string;
      variables?: PromptVariable[];
    }) => apiPost<Prompt>("/v3/prompts", params),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["prompts"] });
    },
  });
}
