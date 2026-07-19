"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { WalletProvider } from "./wallet-provider";
import { Toaster } from "@/components/ui/toaster";

/**
 * Root client-side provider stack:
 *  - next-themes for dark mode
 *  - React Query for server-state (campaigns, donations) with sane defaults
 *  - WalletProvider for Freighter connection state
 *  - Toaster for notifications
 */
export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            gcTime: 5 * 60_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        <WalletProvider>
          {children}
          <Toaster />
        </WalletProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
