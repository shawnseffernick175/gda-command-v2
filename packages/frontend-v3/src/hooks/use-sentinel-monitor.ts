"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import type {
  SentinelHandoffCard,
  SentinelRecentWinCard,
  SentinelUpcomingBreakCard,
  SentinelCreditPacingGovWin,
} from "@/lib/types";

export function useSentinelHandoffs() {
  return useQuery({
    queryKey: ["sentinel", "handoffs"],
    queryFn: () =>
      apiGet<{ items: SentinelHandoffCard[]; count: number }>(
        "/v3/sentinel/handoffs",
      ),
    refetchInterval: 60_000,
  });
}

export function useSentinelCreditPacingGovWin() {
  return useQuery({
    queryKey: ["sentinel", "credit-pacing", "govwin"],
    queryFn: () =>
      apiGet<SentinelCreditPacingGovWin>("/v3/sentinel/credit-pacing/govwin"),
    refetchInterval: 60_000,
  });
}

export function useSentinelRecentWins() {
  return useQuery({
    queryKey: ["sentinel", "recent-wins"],
    queryFn: () =>
      apiGet<{ items: SentinelRecentWinCard[]; count: number }>(
        "/v3/sentinel/recent-wins",
      ),
    refetchInterval: 60_000,
  });
}

export function useSentinelUpcomingBreaks() {
  return useQuery({
    queryKey: ["sentinel", "upcoming-breaks"],
    queryFn: () =>
      apiGet<{ items: SentinelUpcomingBreakCard[]; count: number }>(
        "/v3/sentinel/upcoming-breaks",
      ),
    refetchInterval: 60_000,
  });
}
