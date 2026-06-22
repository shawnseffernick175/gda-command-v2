"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";

export interface NewsItem {
  id: number;
  title: string;
  blurb: string;
  url: string;
  source_name: string;
  published_at: string;
  is_wheelhouse: boolean;
}

export function useDigestNews(limit = 12) {
  return useQuery({
    queryKey: ["digest", "news", limit],
    queryFn: () => apiGet<NewsItem[]>("/v3/digest/news", { limit }),
    staleTime: 5 * 60 * 1000,
  });
}
