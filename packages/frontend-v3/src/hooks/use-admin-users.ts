import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";

export interface AdminUser {
  id: number;
  email: string;
  display_name: string;
  role: "admin" | "operator" | "viewer";
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

interface AdminUsersResponse {
  items: AdminUser[];
  total: number;
}

export function useAdminUsers() {
  return useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => apiGet<AdminUsersResponse>("/v3/admin/users"),
  });
}

export function useCreateAdminUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; display_name: string; role: string; password?: string }) =>
      apiPost<AdminUser & { _temp_password?: string }>("/v3/admin/users", body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin", "users"] }),
  });
}

export function useUpdateAdminUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number; role?: string; is_active?: boolean; display_name?: string }) =>
      apiPatch<AdminUser>(`/v3/admin/users/${id}`, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin", "users"] }),
  });
}

export function useDeactivateAdminUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/v3/admin/users/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin", "users"] }),
  });
}
