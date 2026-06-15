"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";

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
  opportunity_count: number;
  pipeline_count: number;
}

export interface VehicleOpportunity {
  id: number;
  title: string;
  agency: string | null;
  naics: string | null;
  value_min: number | null;
  value_max: number | null;
  is_idiq?: boolean;
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

export function useVehicleOpportunities(vehicleId: number | null) {
  return useQuery({
    queryKey: ["vehicle-opportunities", vehicleId],
    queryFn: () => apiGet<VehicleOpportunity[]>(`/v3/vehicles/${vehicleId}/opportunities`),
    enabled: vehicleId !== null,
  });
}
