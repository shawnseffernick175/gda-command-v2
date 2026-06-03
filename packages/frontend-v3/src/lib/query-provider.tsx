"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

// @base-ui/react ships @types/react@18 which conflicts with React 19 ReactNode.
// The cast below bridges the two type worlds without affecting runtime behavior.
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <QueryClientProvider client={client}>{children as any}</QueryClientProvider>;
}
