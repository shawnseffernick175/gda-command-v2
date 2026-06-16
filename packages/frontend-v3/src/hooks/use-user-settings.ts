"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch } from "@/lib/api";

export interface UserSettings {
  [key: string]: unknown;
}

export function useUserSettings() {
  return useQuery({
    queryKey: ["user-settings"],
    queryFn: () => apiGet<UserSettings>("/v3/users/me/settings"),
    staleTime: 60 * 1000,
  });
}

export function useUpdateUserSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<UserSettings>) =>
      apiPatch<UserSettings>("/v3/users/me/settings", patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["user-settings"] });
    },
  });
}
