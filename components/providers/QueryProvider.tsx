'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';

export default function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        // Data stays fresh for 20 s, so moving between screens does not re-download it.
        staleTime: 20_000,
        gcTime: 10 * 60_000,
        // Live changes arrive through the realtime subscriptions in hooks/use-database.ts.
        // This slow poll is only a safety net (it used to ask every 2 seconds, for every query).
        refetchInterval: 45_000,
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: true,
        retry: 1,
      },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
