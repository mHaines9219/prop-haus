'use client';

import Link from 'next/link';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { Theme } from '@astryxdesign/core/theme';
import { LinkProvider } from '@astryxdesign/core/Link';
import { stoneTheme } from '@astryxdesign/theme-stone/built';

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
    <Theme theme={stoneTheme}>
      {/* Route every Astryx <Link>/nav item through next/link. */}
      <LinkProvider component={Link}>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </LinkProvider>
    </Theme>
  );
}
