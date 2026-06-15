"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api";

export interface VehicleSummary {
  id: number;
  name: string;
  short_name: string;
  contract_number: string | null;
  vehicle_type: string;
  agency: string | null;
  naics_primary: string | null;
  expiration_date: string | null;
  ceiling_value: number | null;
  is_active: boolean;
  notes: string | null;
  sponsor_agency: string | null;
  prime_or_sub: string | null;
  prime_contractor: string | null;
  period_of_performance_start: string | null;
  period_of_performance_end: string | null;
  naics_codes: string[] | null;
  set_aside_type: string | null;
  status: string | null;
  source_doc_paths: string[] | null;
  source_vault_doc_ids: number[] | null;
  extraction_confidence: string | null;
  needs_review: boolean;
  extracted_at: string | null;
  opportunity_count: number;
  pipeline_count: number;
}

export interface VehicleDetail extends VehicleSummary {
  source_docs: {
    id: number;
    filename: string;
    doc_type: string;
    uploaded_at: string;
  }[];
}

export interface VehicleOpportunity {
  id: number;
  title: string;
  agency: string | null;
  naics: string | null;
  value_min: number | null;
  value_max: number | null;
  response_due_at: string | null;
  posted_at: string | null;
  pipeline_stage: string | null;
  set_aside: string | null;
  source_uri: string | null;
  match_type: string;
  match_evidence: string | null;
}

export function useVehicles() {
  return useQuery({
    queryKey: ["vehicles"],
    queryFn: () => apiGet<VehicleSummary[]>("/v3/vehicles"),
  });
}

export function useVehicleDetail(vehicleId: number | null) {
  return useQuery({
    queryKey: ["vehicle-detail", vehicleId],
    queryFn: () => apiGet<VehicleDetail>(`/v3/vehicles/${vehicleId}`),
    enabled: vehicleId !== null,
  });
}

export function useVehicleOpportunities(vehicleId: number | null) {
  return useQuery({
    queryKey: ["vehicle-opportunities", vehicleId],
    queryFn: () => apiGet<VehicleOpportunity[]>(`/v3/vehicles/${vehicleId}/opportunities`),
    enabled: vehicleId !== null,
  });
}

export function useReingestAllVehicles() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (force: boolean) =>
      apiPost<{ status: string; force: boolean }>("/v3/vehicles/reingest-all", { force }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["vehicles"] });
    },
  });
}
