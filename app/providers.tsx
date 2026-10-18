'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { useState } from 'react';
import { PlanProvider } from '@/lib/plan-view';

export function Providers({ children }: { children: React.ReactNode }) {
  // One client per browser session; created lazily so it isn't shared across
  // requests on the server.
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return (
    <ThemeProvider attribute="data-theme" defaultTheme="light" enableSystem={false}>
      <QueryClientProvider client={client}>
        <PlanProvider>{children}</PlanProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
